create or replace function battlemap_room.scene_pause_applies(ticket uuid)
returns boolean language sql stable set search_path='' as $$
 select not exists(
  select 1 from battlemap_room.players a join battlemap_room.profiles p on p.name=a.profile
  where a.token=ticket and p.approved and p.can_test and p.password_hash is not null
 );
$$;
revoke all on function battlemap_room.scene_pause_applies(uuid) from public;
CREATE OR REPLACE FUNCTION public.battlemap_scene_customize(ticket uuid, requested_scene text, object_id text, action text, value jsonb, expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.encounters%rowtype; actor text; obj jsonb; idx integer; bucket text; dropped jsonb; carrier_idx integer; spawn jsonb;
begin
 perform 1 from battlemap_room.scene_lifecycle where singleton for share;
 if requested_scene is null or battlemap_room.scene_viewer(ticket, requested_scene) is null then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 if not exists(select 1 from battlemap_room.encounters e where e.scene_id=requested_scene) then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 perform set_config('battlemap.encounter_scope', (select e.event_scope::text
  from battlemap_room.encounters e where e.scene_id=requested_scene), true);
 if battlemap_room.scene_viewer(ticket, requested_scene) is distinct from 'player' then return jsonb_build_object('error','Choose a player profile.'); end if;
 select profile into actor from battlemap_room.players where token=ticket;
 select * into st from battlemap_room.encounters where scene_id=requested_scene for update;
 if st.scene is null or (st.paused and battlemap_room.scene_pause_applies(ticket)) then return jsonb_build_object('error','The scene is paused.'); end if;
 if st.revision is distinct from expected_revision then return jsonb_build_object('error','The scene changed. Try again.'); end if;
 if action in ('dimension_door','arcane_eye','arcane_eye_move','find_familiar') then
  declare px numeric; py numeric; pz numeric; size numeric; radius numeric; new_id text; result jsonb; pref text;
  begin
   select t into obj from jsonb_array_elements(st.scene->'tokens') t
   join battlemap_room.controllers c on c.standee_id=t->>'roomId' and c.profile=actor
   where t->>'roomId'=object_id and t->>'incognito' is distinct from 'true' and not coalesce(t->'conditions' ? 'dead',false);
   if not found then return jsonb_build_object('error','Choose your standee.'); end if;
   if action='arcane_eye' and (value is null or value='null'::jsonb) then
    update battlemap_room.encounters set scene=jsonb_set(st.scene,'{tokens}',(select jsonb_agg(case when t->>'roomId'=object_id then t-'arcaneEye' else t end order by ord) from jsonb_array_elements(st.scene->'tokens') with ordinality q(t,ord))),revision=revision+1 where scene_id=requested_scene;
    return jsonb_build_object('ok',true);
   end if;
   if jsonb_typeof(value->'x') is distinct from 'number' or jsonb_typeof(value->'y') is distinct from 'number' or jsonb_typeof(value->'z') is distinct from 'number' then return jsonb_build_object('error','Choose a point on the map.'); end if;
   px:=(value->>'x')::numeric;py:=(value->>'y')::numeric;pz:=(value->>'z')::numeric;
   size:=(obj->>'size')::numeric;
   if action='arcane_eye_move' and jsonb_typeof(obj->'arcaneEye') is distinct from 'array' then return jsonb_build_object('error','Place your Arcane Eye first.'); end if;
   radius:=case action when 'dimension_door' then 100 when 'arcane_eye' then 6 when 'arcane_eye_move' then 60 else 2 end;
   if px not between 0 and 40 or py not between 0 and 40 or pz not between 0 and 11 or
    power(greatest(0, abs(px+(case when action in ('arcane_eye','arcane_eye_move') then 0 when action='find_familiar' then .5 else size/2 end)-(obj->>'x')::numeric-size/2)-size/2),2)+
    power(greatest(0, abs(py+(case when action in ('arcane_eye','arcane_eye_move') then 0 when action='find_familiar' then .5 else size/2 end)-(obj->>'y')::numeric-size/2)-size/2),2)+(case when action in ('arcane_eye','find_familiar') then 0 else power(pz-(obj->>'z')::numeric,2) end)>radius*radius then
    return jsonb_build_object('error','That point is outside the spell range.');
   end if;
   if action='dimension_door' then
    declare passenger_id text:=nullif(value->>'allyId',''); passenger jsonb; traveller jsonb;
     destination numeric[]; occupied jsonb; arrivals jsonb:='{}'; damage jsonb:='[]'; dice int[];
     dx numeric; dy numeric; dz numeric; width numeric; tid text;
    begin
     if passenger_id is not null then
      select t into passenger from jsonb_array_elements(st.scene->'tokens') t
      where t->>'roomId'=passenger_id and passenger_id<>object_id
       and (t->>'size')::numeric<=1 and coalesce(t->>'baseRole',t->>'role') in ('pc','ally')
       and t->>'incognito' is distinct from 'true' and not coalesce(t->'conditions' ? 'dead',false)
       and greatest(abs((t->>'x')::numeric+.5-(obj->>'x')::numeric-size/2),abs((t->>'y')::numeric+.5-(obj->>'y')::numeric-size/2))<=size/2+.5
       and abs((t->>'z')::numeric-(obj->>'z')::numeric)<1;
      if passenger is null then return jsonb_build_object('error','Choose an adjacent Medium or smaller ally.'); end if;
     end if;
     select coalesce(jsonb_agg(to_jsonb(q)),'[]') into occupied from (
   select (t->>'x')::numeric x,(t->>'y')::numeric y,(t->>'z')::numeric z,(t->>'size')::numeric w,(t->>'size')::numeric d,1 h,false support,coalesce(array_position(array['tiny','small','medium','large','huge'],t->>'sizeCategory'),least(5,greatest(3,ceil((t->>'size')::numeric)::int+2))) size_rank
    from jsonb_array_elements(st.scene->'tokens') t where t->>'roomId' not in (object_id,coalesce(passenger_id,''))
   union all
   select (t->>'x')::numeric,(t->>'y')::numeric,(t->>'z')::numeric,
    case when coalesce((t->>'r')::int,0)%2=1 then v.d else v.w end,
    case when coalesce((t->>'r')::int,0)%2=1 then v.w else v.d end,v.h,true support,null::integer size_rank
   from jsonb_array_elements(st.scene->'pieces') t join (values ('terrace',3,2,1),('stone',2,2,2),('wall',3,1,2),('pillar',1,1,3),('column',.5,.5,3),('bridge',3,1,1),('crate',1,1,1),('fountain',1,1,1),('stream',3,1,0),('waterfall',2,1,2),('volume',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>'type'
   cross join lateral (select
    case when defaults.kind='volume' then coalesce((t->'extents'->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind='volume' then coalesce((t->'extents'->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind='volume' then coalesce((t->'extents'->>2)::numeric,defaults.h) else defaults.h end h
   ) v
     ) q where q.h>0;
     for traveller in select obj union all select passenger where passenger is not null loop
      tid:=traveller->>'roomId';width:=(traveller->>'size')::numeric;
      dx:=px+(traveller->>'x')::numeric-(obj->>'x')::numeric;
      dy:=py+(traveller->>'y')::numeric-(obj->>'y')::numeric;
      dz:=pz+(traveller->>'z')::numeric-(obj->>'z')::numeric;
      with obstacles as materialized (select * from jsonb_to_recordset(occupied) q(x numeric,y numeric,z numeric,w numeric,d numeric,h numeric,support boolean,size_rank integer))
      select array[c.x,c.y,c.z] into destination from (select dx x,dy y,dz z) c
      where c.x between 0 and 40-width and c.y between 0 and 40-width and c.z between 0 and 11
      and not exists(select from obstacles q
       where c.x<q.x+q.w and c.x+width>q.x and c.y<q.y+q.d and c.y+width>q.y and c.z<q.z+q.h and c.z+1>q.z)
      and (c.z=0 or traveller->>'flying'='true' or exists(select from obstacles q
       where (q.support or q.size_rank >= coalesce(array_position(array['tiny','small','medium','large','huge'],traveller->>'sizeCategory'),least(5,greatest(3,ceil((traveller->>'size')::numeric)::int+2))) + 2) and c.z=q.z+q.h and c.x+width/2>=q.x and c.x+width/2<q.x+q.w and c.y+width/2>=q.y and c.y+width/2<q.y+q.d))
;
      if destination is null then
      with obstacles as materialized (select * from jsonb_to_recordset(occupied) q(x numeric,y numeric,z numeric,w numeric,d numeric,h numeric,support boolean,size_rank integer))
      select array[c.x,c.y,c.z] into destination
      from (
       select dx x,dy y,dz z
       union
       select gx,gy,gz from generate_series(0,40-width,1) gx cross join generate_series(0,40-width,1) gy
       cross join (select 0::numeric gz union select dz union select q.z+q.h from obstacles q where (q.support or q.size_rank >= coalesce(array_position(array['tiny','small','medium','large','huge'],traveller->>'sizeCategory'),least(5,greatest(3,ceil((traveller->>'size')::numeric)::int+2))) + 2)) levels
      ) c
      where c.x between 0 and 40-width and c.y between 0 and 40-width and c.z between 0 and 11
      and not exists(select from obstacles q
       where c.x<q.x+q.w and c.x+width>q.x and c.y<q.y+q.d and c.y+width>q.y and c.z<q.z+q.h and c.z+1>q.z)
      and (c.z=0 or traveller->>'flying'='true' or exists(select from obstacles q
       where (q.support or q.size_rank >= coalesce(array_position(array['tiny','small','medium','large','huge'],traveller->>'sizeCategory'),least(5,greatest(3,ceil((traveller->>'size')::numeric)::int+2))) + 2) and c.z=q.z+q.h and c.x+width/2>=q.x and c.x+width/2<q.x+q.w and c.y+width/2>=q.y and c.y+width/2<q.y+q.d))
      order by power(c.x-dx,2)+power(c.y-dy,2)+power(c.z-dz,2),random() limit 1;
      end if;
      if destination is null then return jsonb_build_object('error','No open arrival square was found.'); end if;
      if destination<>array[dx,dy,dz] then
       select array_agg(1+floor(random()*6)::int) into dice from generate_series(1,4);
       damage:=damage||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(traveller->>'displayName',''),traveller->>'name','Standee'),'dice',dice,'total',(select sum(n) from unnest(dice) n)));
      end if;
      arrivals:=arrivals||jsonb_build_object(tid,jsonb_build_object('x',destination[1],'y',destination[2],'z',destination[3]));
      occupied:=occupied||jsonb_build_array(jsonb_build_object('x',destination[1],'y',destination[2],'z',destination[3],'w',width,'d',width,'h',1,'support',false,'size_rank',coalesce(array_position(array['tiny','small','medium','large','huge'],traveller->>'sizeCategory'),least(5,greatest(3,ceil((traveller->>'size')::numeric)::int+2)))));
     end loop;
     update battlemap_room.encounters set scene=jsonb_set(st.scene,'{tokens}',(select jsonb_agg(t||coalesce(arrivals->(t->>'roomId'),'{}') order by ord) from jsonb_array_elements(st.scene->'tokens') with ordinality q(t,ord))),revision=revision+1 where scene_id=requested_scene;
     return jsonb_build_object('ok',true,'damage',damage);
    end;
   elsif action in ('arcane_eye','arcane_eye_move') then
    update battlemap_room.encounters set scene=jsonb_set(st.scene,'{tokens}',(select jsonb_agg(case when t->>'roomId'=object_id then t||jsonb_build_object('arcaneEye',jsonb_build_array(px,py,pz)) else t end order by ord) from jsonb_array_elements(st.scene->'tokens') with ordinality q(t,ord))),revision=revision+1 where scene_id=requested_scene;
    return jsonb_build_object('ok',true);
   end if;
   pref:=value->>'sizeCategory';
   if coalesce(pref,'') not in ('small','tiny') then return jsonb_build_object('error','Choose Small or Tiny.'); end if;
   -- Replace caster familiars inside the spawn rollback block.
   delete from battlemap_room.controllers c
    using jsonb_array_elements(st.scene->'tokens') old_token
    where old_token->>'familiarCaster'=object_id
      and c.standee_id=old_token->>'roomId'
      and c.profile=old_token->>'familiarOwner';
   st.scene:=jsonb_set(st.scene,'{tokens}',(
    select coalesce(jsonb_agg(t order by ord),'[]'::jsonb)
    from jsonb_array_elements(st.scene->'tokens') with ordinality q(t,ord)
    where t->>'familiarCaster' is distinct from object_id
   ));
   new_id:=gen_random_uuid()::text;
   spawn:=jsonb_build_object('type','standee','role','ally','baseRole','ally','x',px,'y',py,'z',pz,'size',1,'r',0,'name','Familiar','sizeCategory',pref,'hp',1,'maxHp',1,'color','#887350','icon','✦','roomId',new_id,'familiarCaster',object_id,'familiarOwner',actor);
   if value ? 'templateId' then
    declare template battlemap_room.familiar_catalog%rowtype;
    begin
     select * into template from battlemap_room.familiar_catalog c
      where c.id::text=value->>'templateId' and c.owner in ('',actor) and c.size=pref;
     if not found then raise exception 'That familiar template is unavailable.'; end if;
     spawn:=spawn||template.appearance||jsonb_build_object('name',template.name,'displayName',template.name,
      'hp',coalesce(template.appearance->'maxHp','1'::jsonb));
    end;
   end if;
   insert into battlemap_room.controllers(profile,standee_id,character_name) values(actor,new_id,spawn->>'name');
   update battlemap_room.encounters set scene=jsonb_set(st.scene,'{tokens}',(st.scene->'tokens')||jsonb_build_array(spawn)) where scene_id=requested_scene;
   result:=public.battlemap_room_move(ticket,new_id,px,py,pz,expected_revision);
   if result ? 'error' then raise exception using message=result->>'error',errcode='P0001'; end if;
   return result||jsonb_build_object('roomId',new_id);
  exception when raise_exception then return jsonb_build_object('error',sqlerrm);
  end;
 end if;
 if action in ('spell_light_create','spell_light_remove') then
  if action='spell_light_remove' then
   select a,ord-1 into obj,idx from jsonb_array_elements(st.scene->'areas') with ordinality q(a,ord)
    where a->>'roomId'=object_id and a->>'spellOwner'=actor;
   if not found then return jsonb_build_object('error','Choose your own spell light.'); end if;
   st.scene:=st.scene #- array['areas',idx::text];
  else
   select t into obj from jsonb_array_elements(st.scene->'tokens') t
    join battlemap_room.controllers c on c.standee_id=t->>'roomId' and c.profile=actor
    where t->>'roomId'=object_id and t->>'incognito' is distinct from 'true';
   if not found then return jsonb_build_object('error','Choose your standee.'); end if;
   if coalesce(value->>'spell','') not in ('light','dancing') or coalesce(value->>'tint','') !~ '^#[0-9a-fA-F]{6}$' then
    return jsonb_build_object('error','Choose a spell and color.');
   end if;
   if (select count(*) from jsonb_array_elements(st.scene->'areas') a where a->>'spellOwner'=actor and a->>'spell'=battlemap_scene_customize.value->>'spell')
    >= (case when value->>'spell'='light' then 1 else 4 end) then
    return jsonb_build_object('error','Remove an existing spell light first.');
   end if;
   if value->>'spell'='dancing' then
    select jsonb_build_array(x,y,(obj->>'z')::numeric) into spawn
    from generate_series(-1,ceil((obj->>'size')::numeric)::int) u
    cross join generate_series(-1,ceil((obj->>'size')::numeric)::int) v
    cross join lateral (select floor((obj->>'x')::numeric)+u x,floor((obj->>'y')::numeric)+v y) pos
    where (u=-1 or v=-1 or u=ceil((obj->>'size')::numeric) or v=ceil((obj->>'size')::numeric))
     and x between 0 and 39 and y between 0 and 39
     and not exists(select from jsonb_array_elements(st.scene->'tokens') t
      where x+.5 >= (t->>'x')::numeric and x+.5 < (t->>'x')::numeric+(t->>'size')::numeric
       and y+.5 >= (t->>'y')::numeric and y+.5 < (t->>'y')::numeric+(t->>'size')::numeric
       and abs((t->>'z')::numeric-(obj->>'z')::numeric)<1)
     and not exists(select from jsonb_array_elements(st.scene->'pieces') p
      where p->>'type' in ('volume','wall','stone','terrace','pillar','crate')
       and x+.5 >= (p->>'x')::numeric and y+.5 >= (p->>'y')::numeric
       and x+.5 < (p->>'x')::numeric+coalesce((p->'extents'->>(case when (p->>'r')::int%2=0 then 0 else 1 end))::numeric,case p->>'type' when 'wall' then case when (p->>'r')::int%2=0 then 3 else 1 end when 'stone' then 2 when 'terrace' then case when (p->>'r')::int%2=0 then 3 else 2 end when 'volume' then 2 else 1 end)
       and y+.5 < (p->>'y')::numeric+coalesce((p->'extents'->>(case when (p->>'r')::int%2=0 then 1 else 0 end))::numeric,case p->>'type' when 'wall' then case when (p->>'r')::int%2=0 then 1 else 3 end when 'stone' then 2 when 'terrace' then case when (p->>'r')::int%2=0 then 2 else 3 end when 'volume' then 2 else 1 end)
       and (obj->>'z')::numeric+.8 >= (p->>'z')::numeric and (obj->>'z')::numeric+.8 < (p->>'z')::numeric+coalesce((p->'extents'->>2)::numeric,case p->>'type' when 'wall' then 2 when 'stone' then 2 when 'pillar' then 3 else 1 end))
     and not exists(select from jsonb_array_elements(st.scene->'areas') a where a->>'shape'='light'
      and floor((a->'origin'->>0)::numeric)=x and floor((a->'origin'->>1)::numeric)=y
      and abs((a->'origin'->>2)::numeric-(obj->>'z')::numeric)<1)
    order by (u in (-1,ceil((obj->>'size')::numeric)::int) and v in (-1,ceil((obj->>'size')::numeric)::int)),u,v
    limit 1;
    if spawn is null then return jsonb_build_object('error','No adjacent square is available.'); end if;
   end if;
   dropped:=jsonb_build_object('shape','light','fixture','spellLight','spell',value->>'spell',
    'spellOwner',actor,'areaOwner',actor,'roomId',gen_random_uuid(),'on',true,'size',1,'angle',0,
    'origin',coalesce(spawn,jsonb_build_array(least(39,(obj->>'x')::numeric+((obj->>'size')::numeric-1)/2),
     least(39,(obj->>'y')::numeric+((obj->>'size')::numeric-1)/2),(obj->>'z')::numeric)),
    'lightElevation',.8,'bright',case when value->>'spell'='light' then 20 else 0 end,
    'radius',case when value->>'spell'='light' then 40 else 10 end,'tint',value->>'tint');
   st.scene:=jsonb_set(st.scene,'{areas}',coalesce(st.scene->'areas','[]')||jsonb_build_array(dropped));
   if dropped->>'spell'='dancing' then st.scene:=jsonb_set(st.scene,'{areas}',battlemap_room.snake_lights(st.scene->'areas',dropped)); end if;
  end if;
  update battlemap_room.encounters set scene=st.scene,revision=revision+1 where scene_id=requested_scene;
  return jsonb_build_object('ok',true);
 end if;
 if action in ('area_create','area_delete','area_update') then
  select a,ord-1 into obj,idx from jsonb_array_elements(st.scene->'areas') with ordinality q(a,ord) where a->>'roomId'=object_id;
  if action='area_create' and (obj is not null or object_id is null or object_id !~ '^[0-9a-f-]{36}$') then
   return jsonb_build_object('error','Invalid area ID.');
  elsif action<>'area_create' and (obj is null or obj ? 'spellOwner' or obj->>'areaOwner' is distinct from actor) then
   return jsonb_build_object('error','You can only change your own areas.');
  end if;
  if action='area_delete' then
   st.scene:=st.scene #- array['areas',idx::text];
  else
   if coalesce(value->>'shape','') not in ('line','circle','square','cone','sphere','cube','cone3d','difficult')
    or coalesce(value->>'size','') !~ '^([1-9]|[1-3][0-9]|40)$'
    or jsonb_typeof(value->'origin') is distinct from 'array'
    or jsonb_typeof(value->'angle') is distinct from 'number' then
    return jsonb_build_object('error','Invalid area.');
   end if;
   if jsonb_array_length(value->'origin')<>3 or exists (
    select from jsonb_array_elements(value->'origin') coordinate where jsonb_typeof(coordinate)<>'number'
   ) then return jsonb_build_object('error','Invalid area origin.'); end if;
   if exists (select from jsonb_array_elements_text(value->'origin') coordinate where coordinate::numeric not between 0 and 40)
    or (value ? 'pitch' and (jsonb_typeof(value->'pitch')<>'number' or abs((value->>'pitch')::numeric)>90))
    or (value ? 'width' and coalesce(value->>'width','') !~ '^([1-9]|[1-3][0-9]|40)$') then
    return jsonb_build_object('error','Invalid area dimensions.');
   end if;
   obj:=jsonb_strip_nulls(jsonb_build_object('roomId',object_id,'areaOwner',actor,'shape',value->'shape',
    'size',value->'size','origin',value->'origin','angle',value->'angle','pitch',value->'pitch','width',value->'width'));
   if action='area_create' then
    st.scene:=jsonb_set(st.scene,'{areas}',coalesce(st.scene->'areas','[]')||jsonb_build_array(obj));
   else
    st.scene:=jsonb_set(st.scene,array['areas',idx::text],obj);
   end if;
  end if;
  update battlemap_room.encounters set scene=st.scene,revision=revision+1 where scene_id=requested_scene;
  return jsonb_build_object('ok',true);
 end if;
 bucket:=case when action in ('light','pickup','move_light','spell_light_height') then 'areas' else 'tokens' end;
 select a,ord-1 into obj,idx from jsonb_array_elements(st.scene->bucket) with ordinality q(a,ord) where a->>'roomId'=object_id;
 if obj is null or obj->>'incognito'='true' then return jsonb_build_object('error','That object is unavailable.'); end if;
 if action='spell_light_height' then
  if obj->>'spellOwner' is distinct from actor or obj->>'locked'='true' then return jsonb_build_object('error','Choose your own unlocked spell light.'); end if;
  if jsonb_typeof(value) is distinct from 'number' or (value #>> '{}')::numeric not between 0 and 30 then return jsonb_build_object('error','Choose a height from 0 to 30 ft.'); end if;
  obj:=jsonb_set(obj,'{lightElevation}',to_jsonb((value #>> '{}')::numeric/5));
  st.scene:=jsonb_set(st.scene,array['areas',idx::text],obj);
  if obj->>'spell'='dancing' then st.scene:=jsonb_set(st.scene,'{areas}',battlemap_room.snake_lights(st.scene->'areas',obj)); end if;
  update battlemap_room.encounters set scene=st.scene,revision=revision+1 where scene_id=requested_scene;
  return jsonb_build_object('ok',true);
 end if;
 if action='move_light' then
 if obj ? 'spellOwner' and obj->>'spellOwner' is distinct from actor then return jsonb_build_object('error','Choose your own spell light.'); end if;
 if obj->>'shape' is distinct from 'light' or obj->>'secret'='true' or obj->>'locked'='true' then return jsonb_build_object('error','That light cannot be moved.'); end if;
 if jsonb_typeof(value->0) is distinct from 'number' or jsonb_typeof(value->1) is distinct from 'number' or jsonb_typeof(value->2) is distinct from 'number' or (value->>0)::numeric not between 0 and 39 or (value->>1)::numeric not between 0 and 39 or (value->>2)::numeric not between 0 and 11 then return jsonb_build_object('error','Choose a destination on the map.'); end if;
 obj:=jsonb_set(obj,'{origin}',jsonb_build_array(value->0,value->1,value->2));
 st.scene:=jsonb_set(st.scene,array['areas',idx::text],obj);
 if obj->>'spell'='dancing' then st.scene:=jsonb_set(st.scene,'{areas}',battlemap_room.snake_lights(st.scene->'areas',obj)); end if;
 update battlemap_room.encounters set scene=st.scene,revision=revision+1 where scene_id=requested_scene;
 return jsonb_build_object('ok',true);
 end if;
 if obj ? 'spellOwner' then return jsonb_build_object('error','Use the spell light controls.'); end if;
 if action='pickup' then
 if obj->>'shape' is distinct from 'light' or obj->>'secret'='true' or obj->>'locked'='true' then return jsonb_build_object('error','That light cannot be picked up.'); end if;
 select ord-1 into carrier_idx from jsonb_array_elements(st.scene->'tokens') with ordinality q(t,ord) join battlemap_room.controllers c on c.standee_id=t->>'roomId' join battlemap_room.profiles p on p.name=c.profile and p.approved where c.profile=actor and t->>'roomId'=battlemap_scene_customize.value #>> '{}' and t->>'incognito' is distinct from 'true' and t->>'torch' is distinct from 'true' and t->>'carriedDrop' is distinct from 'true' and not coalesce((t->'conditions') ? 'dead',false)
 and abs((t->>'x')::numeric+(t->>'size')::numeric/2-(obj->'origin'->>0)::numeric-.5)<=1.5 and abs((t->>'y')::numeric+(t->>'size')::numeric/2-(obj->'origin'->>1)::numeric-.5)<=1.5 and abs((t->>'z')::numeric-(obj->'origin'->>2)::numeric)<=.5;
 if not found then return jsonb_build_object('error','Move next to the light with a free hand.'); end if;
 update battlemap_room.encounters set scene=jsonb_set(st.scene #- array['areas',idx::text],array['tokens',carrier_idx::text],(st.scene->'tokens'->carrier_idx)||jsonb_build_object('carriedFixture',obj - 'roomId' - 'origin' - 'locked' - 'secret','carriedDrop',true,'torch',obj->'on','torchBright',obj->'bright','torchDim',obj->'radius','torchColor',obj->'tint')),revision=revision+1 where scene_id=requested_scene;
 return jsonb_build_object('ok',true);
 end if;
 if not (action='light' and obj->>'shape'='light' and obj->>'dropped'='true') and not exists(select from jsonb_array_elements(st.scene->'tokens') t join battlemap_room.controllers c on c.standee_id=t->>'roomId' join battlemap_room.profiles p on p.name=c.profile and p.approved where c.profile=actor and t->>'incognito' is distinct from 'true' and (case when action='light' then obj->>'shape'='light' and abs((t->>'x')::numeric+(t->>'size')::numeric/2-(obj->'origin'->>0)::numeric-.5)<=1.5 and abs((t->>'y')::numeric+(t->>'size')::numeric/2-(obj->'origin'->>1)::numeric-.5)<=1.5 and abs((t->>'z')::numeric-(obj->'origin'->>2)::numeric)<=.5 else t->>'roomId'=object_id end)) then return jsonb_build_object('error','Choose your standee or move next to the light.'); end if;
 if action='light' and obj->>'secret' is distinct from 'true' and obj->>'locked' is distinct from 'true' and jsonb_typeof(value)='boolean' then obj:=obj||jsonb_build_object('on',value);
 elsif action in ('hp','tempHp') and (battlemap_scene_customize.value #>> '{}') ~ '^[+-]?[0-9]{1,5}$' then
  declare n numeric; ceiling numeric;
  begin
   n:=(battlemap_scene_customize.value #>> '{}')::numeric;
   if left(battlemap_scene_customize.value #>> '{}',1) in ('+','-') then n:=coalesce((obj->>action)::numeric,0)+n; end if;
   ceiling:=case when action='hp' then coalesce((obj->>'maxHp')::numeric,99999) else 99999 end;
   obj:=jsonb_set(obj,array[action],to_jsonb(greatest(0,least(ceiling,n))));
  end;
 elsif bucket='tokens' and action='clear_target' then
  obj:=obj-array['targetRoomId','targetId'];
 elsif action='target' and exists(select from jsonb_array_elements(st.scene->'tokens') t where t->>'roomId'=battlemap_scene_customize.value #>> '{}' and t->>'roomId'<>object_id and t->>'incognito' is distinct from 'true') then
  obj:=obj||jsonb_build_object('targetRoomId',value);
 elsif action='conditions' and jsonb_typeof(value)='array' then
  if jsonb_array_length(value)>24 or exists(select from jsonb_array_elements_text(value) x where x is null or x not in ('prone','grappled','restrained','stunned','paralyzed','petrified','incapacitated','poisoned','blinded','deafened','invisible','obscured','exhaustion','unconscious','dead','concentrating','charmed','frightened','blue','green','yellow')) then
   return jsonb_build_object('error','Invalid status effects.');
  end if;
  obj:=jsonb_set(obj,'{conditions}',coalesce((
   select jsonb_agg(distinct x) from (
    select x from jsonb_array_elements_text(coalesce(obj->'conditions','[]')) x where x not in ('prone','grappled','restrained','stunned','paralyzed','petrified','incapacitated','poisoned','blinded','deafened','invisible','obscured','exhaustion','unconscious','dead','concentrating','charmed','frightened','blue','green','yellow')
    union all select x from jsonb_array_elements_text(value) x
   ) marks
  ),'[]'));
 elsif action='stats' and jsonb_typeof(value)='object' then
  declare k text; raw text; n numeric; cap numeric;
  begin
   foreach k in array array['hp','tempHp','ac','saveDc'] loop
    if not value ? k then continue; end if;
    raw:=value->>k;
    if raw is null or raw !~ '^[+-]?[0-9]{1,5}$' then return jsonb_build_object('error','Enter a valid stat value.'); end if;
    n:=raw::numeric;
    if left(raw,1) in ('+','-') then n:=coalesce((obj->>k)::numeric,0)+n; end if;
    cap:=case k when 'hp' then coalesce((obj->>'maxHp')::numeric,99999) when 'tempHp' then 99999 else 99 end;
    obj:=jsonb_set(obj,array[k],to_jsonb(greatest(0,least(n,cap))));
   end loop;
   if value ? 'vision' then
    if coalesce(value->'vision'->>'type','') not in ('regular','blind','dark')
     or coalesce(value->'vision'->>'range','') !~ '^([0-9]|[1-9][0-9]|[12][0-9][0-9]|300)$'
     or (value->'vision'->>'type'='dark' and value->'vision'->>'range'='0') then
     return jsonb_build_object('error','Invalid vision settings.');
    end if;
    obj:=jsonb_set(obj,'{conditions}',coalesce(obj->'conditions','[]') - 'blinded');
    case value->'vision'->>'type'
     when 'blind' then obj:=jsonb_set(obj,'{conditions}',(obj->'conditions')||'["blinded"]');
     when 'dark' then obj:=jsonb_set(obj,'{darkvision}',to_jsonb((value->'vision'->>'range')::int));
     else obj:=jsonb_set(obj,'{darkvision}','0');
    end case;
   end if;
  end;
 elsif action='aura' then
  if value is null or value='null'::jsonb then obj:=obj-'aura';
  elsif jsonb_typeof(value->'radius')='number' and (value->>'radius')::numeric between 1 and 120 and coalesce(value->>'color','') ~ '^#[0-9a-fA-F]{6}$' then
   obj:=obj||jsonb_build_object('aura',jsonb_build_object('radius',value->'radius','color',value->'color'));
  else return jsonb_build_object('error','Choose a valid aura color and radius.'); end if;
 elsif action='torch_color' and jsonb_typeof(value)='string' and (battlemap_scene_customize.value #>> '{}') ~ '^#[0-9a-fA-F]{6}$' then obj:=obj||jsonb_build_object('torchColor',value);
 elsif action='torch_range' and jsonb_typeof(value->'bright')='number' and jsonb_typeof(value->'dim')='number' then
  if (value->>'bright')::numeric not between 0 and 120 or (value->>'dim')::numeric not between (value->>'bright')::numeric and 120 then return jsonb_build_object('error','Dim radius must be at least the bright radius.'); end if;
  obj:=obj||jsonb_build_object('torchBright',value->'bright','torchDim',value->'dim');
 elsif action='torch_drop' and (obj->>'torch'='true' or obj->>'carriedDrop'='true') and coalesce((obj->>'z')::numeric,0)>=0 and obj->>'flying' is distinct from 'true' then
  dropped:=jsonb_build_object('shape','light','dropped',true,'roomId',gen_random_uuid(),'origin',jsonb_build_array((obj->>'x')::numeric+((obj->>'size')::numeric-1)/2,(obj->>'y')::numeric+((obj->>'size')::numeric-1)/2,(obj->>'z')::numeric),'size',1,'angle',0,'on',coalesce(obj->'torch','false'),'radius',coalesce(obj->'torchDim','40'),'bright',coalesce(obj->'torchBright','20'),'tint',coalesce(obj->'torchColor','"#ffcc80"'));
  st.scene:=jsonb_set(st.scene,'{areas}',coalesce(st.scene->'areas','[]')||jsonb_build_array(coalesce(obj->'carriedFixture','{}')||dropped));
  obj:=(obj-'carriedFixture')||'{"torch":false,"carriedDrop":false}'::jsonb;
 elsif action='torch' and jsonb_typeof(value)='boolean' then obj:=obj||jsonb_build_object('torch',value);
 elsif bucket='tokens' and action='standee_size' and jsonb_typeof(value) in ('string','object') then
  declare
   category text := case when jsonb_typeof(value)='object' then value->>'category' else value #>> '{}' end;
   landing_x numeric := (obj->>'x')::numeric;
   landing_y numeric := (obj->>'y')::numeric;
   footprint int;
   result jsonb;
  begin
   footprint:=case category when 'tiny' then 1 when 'small' then 1 when 'medium' then 1 when 'large' then 2 when 'huge' then 3 end;
   if footprint is null then return jsonb_build_object('error','Choose a valid standee size.'); end if;
   if (obj->>'size')::numeric<>footprint then
    if jsonb_typeof(value)='object' then
     if jsonb_typeof(value->'x') is distinct from 'number' or jsonb_typeof(value->'y') is distinct from 'number' then
      return jsonb_build_object('error','Choose a valid resize position.');
     end if;
     landing_x:=(value->>'x')::numeric;
     landing_y:=(value->>'y')::numeric;
     if abs(landing_x-(obj->>'x')::numeric)>greatest(footprint,(obj->>'size')::numeric)-1
      or abs(landing_y-(obj->>'y')::numeric)>greatest(footprint,(obj->>'size')::numeric)-1
      or landing_x+footprint<=(obj->>'x')::numeric or landing_x>=(obj->>'x')::numeric+(obj->>'size')::numeric
      or landing_y+footprint<=(obj->>'y')::numeric or landing_y>=(obj->>'y')::numeric+(obj->>'size')::numeric then
      return jsonb_build_object('error','The new footprint must overlap the current one.');
     end if;
    end if;
    update battlemap_room.encounters set scene=jsonb_set(st.scene,array[bucket,idx::text],obj||jsonb_build_object('size',footprint,'sizeCategory',category)) where scene_id=requested_scene;
    result:=public.battlemap_scene_move(ticket,requested_scene,object_id,landing_x,landing_y,(obj->>'z')::numeric,expected_revision);
    if result ? 'error' then raise exception using message=result->>'error',errcode='P0001'; end if;
    return result;
   end if;
   obj:=obj||jsonb_build_object('sizeCategory',category);
  exception when raise_exception then return jsonb_build_object('error',sqlerrm);
  end;
 elsif action='looks' and pg_column_size(value)<2000000 and jsonb_typeof(value->'looks')='array' and jsonb_typeof(value->'activeLook')='number' and (value->>'activeLook') ~ '^[0-9]{1,2}$' then
  if jsonb_array_length(value->'looks') not between 1 and 40 or (value->>'activeLook')::int>=jsonb_array_length(value->'looks') or exists(select from jsonb_array_elements(value->'looks') l where jsonb_typeof(l)<>'object' or coalesce(l->>'front','') !~ '^(https?://|data:image/(png|webp);base64,|$)' or coalesce(l->>'back','') !~ '^(https?://|data:image/(png|webp);base64,|$)') then return jsonb_build_object('error','Invalid looks.'); end if;
  obj:=obj||jsonb_build_object('looks',value->'looks','activeLook',value->'activeLook');
 else return jsonb_build_object('error','That change is unavailable.'); end if;
 update battlemap_room.encounters set scene=jsonb_set(st.scene,array[bucket,idx::text],obj),revision=revision+1 where scene_id=requested_scene;
 return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.battlemap_scene_move(ticket uuid, requested_scene text, token_id text, px numeric, py numeric, pz numeric, expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.encounters%rowtype; player battlemap_room.players%rowtype; obj jsonb; idx integer; sz integer;
begin
 perform 1 from battlemap_room.scene_lifecycle where singleton for share;
 if requested_scene is null or battlemap_room.scene_viewer(ticket, requested_scene) is null then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 if not exists(select 1 from battlemap_room.encounters e where e.scene_id=requested_scene) then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 perform set_config('battlemap.encounter_scope', (select e.event_scope::text
  from battlemap_room.encounters e where e.scene_id=requested_scene), true);
 select * into st from battlemap_room.encounters where scene_id=requested_scene for update;
 if battlemap_room.scene_viewer(ticket, requested_scene) is distinct from 'player' then return jsonb_build_object('error','This scene is unavailable.');end if;
 if (st.paused and battlemap_room.scene_pause_applies(ticket)) or st.scene is null then return jsonb_build_object('error','The scene is paused.'); end if;
 if st.revision<>expected_revision then return jsonb_build_object('error','The scene changed. Try again after it refreshes.'); end if;
 select * into player from battlemap_room.players where token=ticket;
 if not found then return jsonb_build_object('error','Choose a profile again.'); end if;
 select t,ord-1 into obj,idx from jsonb_array_elements(st.scene->'tokens') with ordinality as tt(t,ord) where t->>'roomId'=token_id limit 1;
 if obj is null or obj->>'incognito'='true' or not exists(select 1 from battlemap_room.controllers c join battlemap_room.profiles p on p.name=c.profile and p.approved where c.profile=player.profile and c.standee_id=token_id) then
  return jsonb_build_object('error','Choose your character standee.');
 end if;
 sz:=(obj->>'size')::integer;
 if px is null or py is null or pz is null or mod(px*4,1)<>0 or mod(py*4,1)<>0 or mod(pz*4,1)<>0 or px<0 or py<0 or pz<0 or px+sz>40 or py+sz>40 or pz>11 or
    (obj->>'flying'='true' and pz<>(obj->>'z')::numeric) then return jsonb_build_object('error','That destination is outside the map.'); end if;
 if exists(
  select 1 from (
   select (t->>'x')::numeric x,(t->>'y')::numeric y,(t->>'z')::numeric z,(t->>'size')::int w,(t->>'size')::int d,1 h,false terrain,false narrow
    from jsonb_array_elements(st.scene->'tokens') t where t->>'roomId' is distinct from token_id
   union all
   select (t->>'x')::numeric,(t->>'y')::numeric,(t->>'z')::numeric,
    case when coalesce((t->>'r')::int,0)%2=1 then v.d else v.w end,
    case when coalesce((t->>'r')::int,0)%2=1 then v.w else v.d end,v.h,true,(defaults.kind='wall' or (defaults.kind='volume' and v.h>1 and least(v.w,v.d)<=.5 and not coalesce(t->>'stairTread'='true',false) and t->>'form' is null))
   from jsonb_array_elements(st.scene->'pieces') t join (values ('terrace',3,2,1),('stone',2,2,2),('wall',3,1,2),('pillar',1,1,3),('bridge',3,1,1),('crate',1,1,1),('fountain',1,1,1),('stream',3,1,0),('waterfall',2,1,2),('volume',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>'type'
   cross join lateral (select
    case when defaults.kind='volume' then coalesce((t->'extents'->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind='volume' then coalesce((t->'extents'->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind='volume' then coalesce((t->'extents'->>2)::numeric,defaults.h) else defaults.h end h
   ) v
  ) q where px<q.x+q.w and px+sz>q.x and py<q.y+q.d and py+sz>q.y and pz<q.z+q.h and pz+1>q.z
   and not (q.terrain and q.h<=1 and q.z+q.h<=pz+1 and (sz>=3 or coalesce(obj->>'flying'='true',false)))
   and not (q.narrow and (case when q.w<q.d then px+sz/2.0<q.x or px+sz/2.0>=q.x+q.w else py+sz/2.0<q.y or py+sz/2.0>=q.y+q.d end))
 ) then return jsonb_build_object('error','That destination is occupied.'); end if;
 if pz>0 and coalesce(obj->>'flying','false')<>'true' and exists(
  select 1 from generate_series(px+.5,px+sz-.5,1) gx cross join generate_series(py+.5,py+sz-.5,1) gy
  where not exists(
   select 1 from jsonb_array_elements(st.scene->'tokens') t
   where t->>'roomId' is distinct from token_id
    and not coalesce(t->'conditions' ? 'dead',false)
    and coalesce(array_position(array['tiny','small','medium','large','huge'],t->>'sizeCategory'),least(5,greatest(3,(t->>'size')::int+2)))
        >= coalesce(array_position(array['tiny','small','medium','large','huge'],obj->>'sizeCategory'),least(5,greatest(3,sz+2)))+2
    and pz=(t->>'z')::numeric+1
    and gx>=(t->>'x')::numeric and gx<(t->>'x')::numeric+(t->>'size')::numeric
    and gy>=(t->>'y')::numeric and gy<(t->>'y')::numeric+(t->>'size')::numeric
  ) and not exists(
   select 1 from jsonb_array_elements(st.scene->'pieces') t
   join (values ('terrace',3,2,1),('stone',2,2,2),('wall',3,1,2),('pillar',1,1,3),('bridge',3,1,1),('crate',1,1,1),('fountain',1,1,1),('stream',3,1,0),('waterfall',2,1,2),('volume',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>'type'
   cross join lateral (select
    case when defaults.kind='volume' then coalesce((t->'extents'->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind='volume' then coalesce((t->'extents'->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind='volume' then coalesce((t->'extents'->>2)::numeric,defaults.h) else defaults.h end h
   ) v
   where (t->>'z')::numeric+v.h=pz and gx>=(t->>'x')::numeric and gy>=(t->>'y')::numeric
   and gx<(t->>'x')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then v.d else v.w end
   and gy<(t->>'y')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then v.w else v.d end
  )
 ) then return jsonb_build_object('error','That destination has no support.'); end if;
 update battlemap_room.encounters set scene=jsonb_set(st.scene,array['tokens',idx::text],obj||jsonb_build_object('x',px,'y',py,'z',pz)),revision=revision+1 where scene_id=requested_scene;
 return jsonb_build_object('ok',true,'revision',st.revision+1);
end $function$;

CREATE OR REPLACE FUNCTION public.battlemap_scene_opening(ticket uuid, requested_scene text, opening_id text, desired_open boolean, expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.encounters%rowtype; opening jsonb; idx integer;
begin
 perform 1 from battlemap_room.scene_lifecycle where singleton for share;
 if requested_scene is null or battlemap_room.scene_viewer(ticket, requested_scene) is null then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 if not exists(select 1 from battlemap_room.encounters e where e.scene_id=requested_scene) then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 perform set_config('battlemap.encounter_scope', (select e.event_scope::text
  from battlemap_room.encounters e where e.scene_id=requested_scene), true);
 if battlemap_room.scene_viewer(ticket, requested_scene) is distinct from 'player' then return jsonb_build_object('error','Choose a player profile.'); end if;
 select * into st from battlemap_room.encounters where scene_id=requested_scene for update;
 if st.scene is null or (st.paused and battlemap_room.scene_pause_applies(ticket)) then return jsonb_build_object('error','The scene is paused.'); end if;
 if st.revision is distinct from expected_revision then return jsonb_build_object('error','The scene changed. Try again.'); end if;
 select a,ord-1 into opening,idx from jsonb_array_elements(st.scene->'areas') with ordinality q(a,ord) where a->>'roomId'=opening_id and a->>'shape'='opening' and a->>'kind' in ('Door','Window') and a->>'secret' is distinct from 'true';
 if opening is null or desired_open is null then return jsonb_build_object('error','Choose a visible door or window.'); end if;
 if opening->>'locked'='true' then return jsonb_build_object('error','That door or window is locked.'); end if;
 if opening->'open' is distinct from to_jsonb(desired_open) then
 update battlemap_room.encounters set scene=jsonb_set(st.scene,array['areas',idx::text,'open'],to_jsonb(desired_open)),revision=revision+1 where scene_id=requested_scene;
 end if;
 return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.battlemap_scene_polymorph(ticket uuid, requested_scene text, operation text, draft jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 viewer text := battlemap_room.scene_viewer(ticket, requested_scene);
 actor text;
 st battlemap_room.encounters%rowtype;
 caster text := draft->>'caster';
 target text := draft->>'target';
 token jsonb;
 form jsonb;
 original jsonb;
 idx integer;
 form_name text := trim(draft->>'name');
 fields text[] := array['hp','maxHp','tempHp','ac','size','sizeCategory','looks','activeLook','src','icon','color'];
begin
 perform 1 from battlemap_room.scene_lifecycle where singleton for share;
 if requested_scene is null or battlemap_room.scene_viewer(ticket, requested_scene) is null then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 if not exists(select 1 from battlemap_room.encounters e where e.scene_id=requested_scene) then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 perform set_config('battlemap.encounter_scope', (select e.event_scope::text
  from battlemap_room.encounters e where e.scene_id=requested_scene), true);
 if viewer is null or viewer not in ('gm','player') then return jsonb_build_object('error','Sign in first.'); end if;
 if operation='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('name',f.name,'size',f.form->'size') order by f.name) from battlemap_room.polymorph_forms f),'[]'::jsonb);
 end if;
 if operation='save' then
  if viewer<>'gm' then return jsonb_build_object('error','Only the GM can catalog forms.'); end if;
  if coalesce(length(form_name),0) not between 1 and 80 or coalesce(draft->>'size','') not in ('1','2','3')
    or coalesce(draft->>'maxHp','') !~ '^[1-9][0-9]{0,4}$' or coalesce(draft->>'ac','') !~ '^[0-9]{1,2}$'
    or pg_column_size(draft)>2000000 then return jsonb_build_object('error','A form needs a name, size, max HP, and AC.'); end if;
  select jsonb_object_agg(key,value) into form from jsonb_each(draft) where key=any(fields) and value<>'null';
  form := form || jsonb_build_object('hp',form->'maxHp','tempHp',0);
  insert into battlemap_room.polymorph_forms values(form_name,form)
   on conflict(name) do update set form=excluded.form;
  return jsonb_build_object('ok',true);
 end if;
 select * into st from battlemap_room.encounters where scene_id=requested_scene for update;
 if st.scene is null or (st.paused and viewer='player' and battlemap_room.scene_pause_applies(ticket)) then return jsonb_build_object('error','The scene is paused.'); end if;
 if st.revision::text is distinct from draft->>'revision' then return jsonb_build_object('error','The scene changed. Try again.'); end if;
 if viewer='player' then
  select p.profile into actor from battlemap_room.players p where p.token=ticket;
  if not exists(select 1 from battlemap_room.controllers c where c.profile=actor and c.standee_id=caster)
   or not exists(select 1 from jsonb_array_elements(st.scene->'tokens') t where t->>'roomId'=caster and not coalesce(t->'conditions' ? 'dead',false))
  then return jsonb_build_object('error','Choose a standee you control to cast.'); end if;
 end if;
 select t,(ord-1)::int into token,idx from jsonb_array_elements(st.scene->'tokens') with ordinality q(t,ord)
  where t->>'roomId'=target and (viewer='gm' or t->>'incognito' is distinct from 'true');
 if token is null then return jsonb_build_object('error','Choose a visible target.'); end if;
 if operation='cast' then
  if token ? 'polymorph' then return jsonb_build_object('error','End the current Polymorph before applying another.'); end if;
  select f.form into form from battlemap_room.polymorph_forms f where f.name=form_name;
  if form is null then return jsonb_build_object('error','Choose a cataloged form.'); end if;
  if draft ? 'x' or draft ? 'y' or draft ? 'z' then
   if jsonb_typeof(draft->'x') is distinct from 'number'
    or jsonb_typeof(draft->'y') is distinct from 'number'
    or jsonb_typeof(draft->'z') is distinct from 'number'
    or abs((draft->>'x')::numeric-(token->>'x')::numeric)+abs((draft->>'y')::numeric-(token->>'y')::numeric)>1
    or abs((draft->>'z')::numeric-(token->>'z')::numeric)>1
    or (draft->>'x')::numeric not between 0 and 40-(form->>'size')::numeric
    or (draft->>'y')::numeric not between 0 and 40-(form->>'size')::numeric
    or (draft->>'z')::numeric not between 0 and 11
   then return jsonb_build_object('error','Choose a landing within one square.'); end if;
   token:=token||jsonb_build_object('x',draft->'x','y',draft->'y','z',draft->'z');
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}') into original from jsonb_each(token) where key=any(fields);
  insert into battlemap_room.encounter_polymorph_originals values(requested_scene,target,original)
   on conflict(scene_id,target_id) do update set original=excluded.original;
  token := (token-fields)||form||jsonb_build_object('polymorph',jsonb_build_object('caster',caster,'name',form_name));
 elsif operation='end' then
  if not token ? 'polymorph' or (viewer='player' and token->'polymorph'->>'caster' is distinct from caster and
    not exists(select 1 from battlemap_room.controllers c where c.profile=actor and c.standee_id=target))
  then return jsonb_build_object('error','Only the caster, target controller, or GM can end Polymorph.'); end if;
  delete from battlemap_room.encounter_polymorph_originals where scene_id=requested_scene and target_id=target returning encounter_polymorph_originals.original into original;
  if not found then return jsonb_build_object('error','Original form is unavailable.'); end if;
  token := (token-fields-'polymorph')||original;
 else return jsonb_build_object('error','Unknown Polymorph action.'); end if;
 update battlemap_room.encounters set scene=jsonb_set(st.scene,array['tokens',idx::text],token),revision=revision+1 where scene_id=requested_scene;
 return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.battlemap_scene_publish(ticket uuid, requested_scene text, operation text, payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare role_name text:=battlemap_room.scene_viewer(ticket, requested_scene); st battlemap_room.encounters%rowtype; bucket text; c jsonb; next_scene jsonb; items jsonb; actor battlemap_room.players%rowtype; sender text; chat_event battlemap_room.events%rowtype; chat_id bigint; moderation text; delta jsonb; known jsonb; explicit_changes jsonb:='[]'::jsonb;
begin
 perform 1 from battlemap_room.scene_lifecycle where singleton for share;
 if requested_scene is null or battlemap_room.scene_viewer(ticket, requested_scene) is null then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 if not exists(select 1 from battlemap_room.encounters e where e.scene_id=requested_scene) then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 perform set_config('battlemap.encounter_scope', (select e.event_scope::text
  from battlemap_room.encounters e where e.scene_id=requested_scene), true);
 select * into st from battlemap_room.encounters where scene_id=requested_scene for update;
 role_name:=battlemap_room.scene_viewer(ticket, requested_scene);
 if role_name is null then return jsonb_build_object('error','This scene is unavailable.');end if;
 if operation='patch' and role_name='gm' then
  if st.scene is null or (payload->>'revision')::bigint is distinct from st.revision then return jsonb_build_object('error','The scene changed. Try again.');end if;
  if jsonb_typeof(payload->'changes') is distinct from 'array' or jsonb_array_length(payload->'changes')>5000 or pg_column_size(payload)>12000000 then return jsonb_build_object('error','Invalid scene changes.');end if;

  if exists(select 1 from jsonb_array_elements(payload->'changes') j where
   coalesce(j->>'bucket','') not in ('pieces','tokens','areas') or length(coalesce(j->>'id','')) not between 1 and 120
   or not (j ? 'item') or (j->'item' <> 'null'::jsonb and
     (jsonb_typeof(j->'item') is distinct from 'object' or j->'item'->>'roomId' is distinct from j->>'id')))
   or exists(select 1 from jsonb_array_elements(payload->'changes') j group by j->>'bucket',j->>'id' having count(*)>1)
  then return jsonb_build_object('error','Invalid scene changes.');end if;
  next_scene:=st.scene;
  foreach bucket in array array['pieces','tokens','areas'] loop
   select jsonb_object_agg(j->>'id',j->'item') into delta from jsonb_array_elements(payload->'changes') j where j->>'bucket'=bucket;
   if delta is null then continue;end if;
   select coalesce(jsonb_object_agg(t->>'roomId',t) filter(where t->>'roomId' is not null),'{}'::jsonb) into known
   from jsonb_array_elements(coalesce(st.scene->bucket,'[]')) t;
   select explicit_changes||coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'id',d.key,'item',d.value)),'[]'::jsonb)
    into explicit_changes from jsonb_each(delta) d where coalesce(known->d.key,'null'::jsonb) is distinct from d.value;
   select coalesce(jsonb_agg(v.item order by v.ord),'[]'::jsonb) into items from (
    select coalesce(delta->(t.item->>'roomId'),t.item) item,t.ord
     from jsonb_array_elements(coalesce(st.scene->bucket,'[]')) with ordinality t(item,ord)
    union all select d.value,100000+row_number() over() from jsonb_each(delta) d where not known ? d.key
   ) v where v.item<>'null'::jsonb;
   next_scene:=jsonb_set(next_scene,array[bucket],items,true);
  end loop;
  if jsonb_array_length(explicit_changes)>0 then
   perform set_config('battlemap.explicit_delta','yes',true);
   update battlemap_room.encounters set scene=next_scene,revision=revision+1 where scene_id=requested_scene;
   perform set_config('battlemap.explicit_delta','no',true);
   if pg_column_size(explicit_changes)>120000 then
    perform battlemap_room.emit('reset',jsonb_build_object('revision',st.revision+1));
   else
    perform battlemap_room.emit('delta',jsonb_build_object('revision',st.revision+1,'changes',explicit_changes));
   end if;
  end if;
 elsif operation='initiative' and role_name='gm' then
  if jsonb_typeof(payload->'entries') is distinct from 'array' or pg_column_size(payload)>60000 then return jsonb_build_object('error','Invalid initiative order.');end if;
  update battlemap_room.encounters set initiative=payload where scene_id=requested_scene;
  perform battlemap_room.emit('initiative','{}');
 elsif operation='chat_moderate' and role_name='gm' then
  moderation:=payload->>'action';
  if coalesce(payload->>'id','') !~ '^[0-9]{1,18}$' or moderation is null or moderation not in ('hide','show','delete') then
   return jsonb_build_object('error','Choose a valid chat item.');
  end if;
  chat_id:=(payload->>'id')::bigint;
  select * into chat_event from battlemap_room.events where id=chat_id and kind='chat' and encounter_scope=st.event_scope for update;
  if not found then return jsonb_build_object('error','That chat item is no longer available.');end if;
  if moderation='delete' then
   delete from battlemap_room.events where id=chat_id;
  else
   update battlemap_room.events set body=jsonb_set(body,'{hidden}',to_jsonb(moderation='hide')) where id=chat_id;
  end if;
  perform battlemap_room.emit('chat_moderation',jsonb_build_object('id',chat_id,'action',moderation)
   ||case when moderation='show' then jsonb_build_object('message',chat_event.body-'hidden') else '{}'::jsonb end,chat_event.gm_only);
 elsif operation='clear_chat' and role_name='gm' then
  delete from battlemap_room.events where kind='chat' and encounter_scope=st.event_scope;
  perform battlemap_room.emit('clear_chat','{}');
 elsif operation in ('chat','ping') then
  if payload is null or pg_column_size(payload)>25000 then return jsonb_build_object('error','That entry is too large.');end if;
  if role_name='gm' then sender:='GM';else
   select * into actor from battlemap_room.players where token=ticket;
   sender:=coalesce(nullif(actor.display_name,''),actor.profile);
  end if;
  if operation='chat' then
   perform battlemap_room.emit('chat',jsonb_build_object('card',payload->'card','sender',sender),coalesce(payload->>'audience','')='gm');
   if role_name='player' and (not st.paused or not battlemap_room.scene_pause_applies(ticket)) and jsonb_typeof(payload->'initiative')='object' and coalesce(payload->>'audience','')<>'gm' then
    declare chosen jsonb; score numeric; k text; updated_entries jsonb;
    begin
     score:=(payload->'initiative'->>'total')::numeric;
     select t into chosen from jsonb_array_elements(coalesce(st.scene->'tokens','[]')) t where t->>'roomId'=actor.character_key and coalesce(t->>'incognito','false')<>'true'
      and exists(select 1 from battlemap_room.controllers c where c.profile=actor.profile and c.standee_id=actor.character_key);
     if chosen is not null and score between -99 and 999 then
      k:=coalesce(chosen->>'initiativeKey',chosen->>'roomId');
      updated_entries:=coalesce((select jsonb_agg(e) from jsonb_array_elements(st.initiative->'entries') e where e->>0<>k),'[]')||jsonb_build_array(jsonb_build_array(k,jsonb_build_object('name',sender,'total',score,'roomId',chosen->>'roomId')));
      update battlemap_room.encounters set initiative=jsonb_set(st.initiative,'{entries}',updated_entries) where scene_id=requested_scene;
      perform battlemap_room.emit('initiative','{}');
     end if;
    end;
   end if;
  else
   if jsonb_typeof(payload->'x') is distinct from 'number' or jsonb_typeof(payload->'y') is distinct from 'number' or jsonb_typeof(payload->'z') is distinct from 'number' or (payload->>'x')::numeric not between 0 and 40 or (payload->>'y')::numeric not between 0 and 40 or (payload->>'z')::numeric not between 0 and 12 then return jsonb_build_object('error','Invalid ping.');end if;
   perform battlemap_room.emit('ping',jsonb_build_object(
    'x',payload->'x','y',payload->'y','z',payload->'z','name',sender,
    'recenter',role_name='gm' and payload->'recenter'='true'::jsonb,
    'normal',case when jsonb_typeof(payload->'normal')='array' then
     case when jsonb_array_length(payload->'normal')=3 then payload->'normal' end
    end
   ));
  end if;
 else return jsonb_build_object('error','That action is unavailable.');end if;
 return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.battlemap_scene_sync(ticket uuid, requested_scene text DEFAULT NULL::text, since_event bigint DEFAULT '-1'::integer, snapshot boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare role_name text; st battlemap_room.encounters%rowtype; active_id text; resolved_scene text; gm_online boolean; can_browse boolean; latest bigint; oldest bigint; entries jsonb; reset boolean; online jsonb; blocked boolean;
begin
 select active_scene_id into active_id from battlemap_room.scene_lifecycle where singleton;
 resolved_scene:=coalesce(requested_scene,active_id);
 role_name:=battlemap_room.scene_viewer(ticket,resolved_scene);
 if requested_scene is not null and role_name is null then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 select * into st from battlemap_room.encounters e where e.scene_id=resolved_scene;
 select coalesce(heartbeat>now()-interval '65 seconds',false) into gm_online from battlemap_room.state where id;
 can_browse:=role_name='gm' or exists(
  select 1 from battlemap_room.players a join battlemap_room.profiles p on p.name=a.profile
  where a.token=ticket and p.approved and p.can_test and p.password_hash is not null
 );
 if role_name is null and not exists(select 1 from battlemap_room.players a join battlemap_room.profiles p on p.name=a.profile and p.approved where a.token=ticket) then
  return jsonb_build_object('error','Choose your profile again.');
 end if;
 blocked:=role_name is null or st.scene is null;
 if role_name='gm' then
  select coalesce(jsonb_agg(profile order by lower(profile)),'[]'::jsonb) into online
   from (select distinct a.profile from battlemap_room.players a join battlemap_room.profiles p on p.name=a.profile and p.approved
    where a.updated>now()-interval '65 seconds') names;
 end if;
 select version into latest from public.battlemap_room_signal where id;
 if blocked then
  return jsonb_build_object('cursor',latest,'reset',true,'events','[]'::jsonb,'revision',st.revision,
   'active',false,'activeSceneId',active_id,'canBrowseScenes',can_browse,'paused',true,'testing',false,'title',null,'gmOnline',gm_online,
   'initiative',jsonb_build_object('entries','[]'::jsonb,'active',null,'round',1));
 end if;
 select min(id) into oldest from battlemap_room.events where encounter_scope=st.event_scope;
 reset:=since_event<0 or (oldest is not null and since_event<oldest-1) or exists(select 1 from battlemap_room.events where id>since_event and id<=latest and kind='reset' and encounter_scope=st.event_scope);
 if reset then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'at',created_at) order by id),'[]') into entries
  from (select * from battlemap_room.events where kind='chat' and encounter_scope=st.event_scope and (not gm_only or role_name='gm') and (role_name='gm' or kind<>'chat' or body->'hidden' is distinct from 'true'::jsonb) order by id desc limit 50) q;
 else
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',case when kind='delta' and role_name<>'gm' then
   body||jsonb_build_object('changes',coalesce((select jsonb_agg(c||jsonb_build_object('item',case when c->'item'='null' then null else battlemap_room.player_token(c->'item') end)) from jsonb_array_elements(body->'changes') c where c->>'bucket'='tokens'),'[]')||
   coalesce((select jsonb_agg(c) from jsonb_array_elements(body->'changes') c where c->>'bucket'<>'tokens'),'[]'))
   else body end,'at',created_at) order by id),'[]') into entries
  from battlemap_room.events where id>since_event and id<=latest and encounter_scope=st.event_scope and (not gm_only or role_name='gm') and (role_name='gm' or kind<>'chat' or body->'hidden' is distinct from 'true'::jsonb) and (kind<>'ping' or created_at>now()-interval '7 seconds')
   and (kind<>'chat_moderation' or body->>'action'<>'show' or exists(
    select 1 from battlemap_room.events original
    where original.kind='chat' and original.id::text=battlemap_room.events.body->>'id'
     and original.encounter_scope=st.event_scope
     and (role_name='gm' or original.body->'hidden' is distinct from 'true'::jsonb)
   ));
 end if;
 return jsonb_build_object('cursor',latest,'reset',reset,'events',entries,'revision',st.revision,'active',st.scene is not null,'title',st.title,'testing',false,'sceneId',st.scene_id,'activeSceneId',active_id,'canBrowseScenes',can_browse,
 'paused',st.paused and battlemap_room.scene_pause_applies(ticket),'gmOnline',gm_online,
 'initiative',case when role_name='gm' then st.initiative else battlemap_room.public_initiative(st.initiative,st.scene) end,
 'onlinePlayers',online,'pings',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind','ping','body',p.body,'at',p.created_at) order by p.created_at) from (select * from battlemap_room.transient_pings where created_at>now()-interval '7 seconds' and test_id=st.event_scope and scene_id=st.scene_id order by created_at desc limit 40) p),'[]'::jsonb),'scene',case when (snapshot or reset) and st.scene is not null then case when role_name='gm' then st.scene else battlemap_room.encounter_player_scene(st.scene_id,-1)->'scene' end else null end);
end $function$;
