
alter table battlemap_room.profiles add column password_hash text, add column can_test boolean not null default false, add column password_attempt timestamptz;
alter table battlemap_room.state add column active_scene_id text, add column test_id uuid, add column suspended_live jsonb;
alter table battlemap_room.events add column test_id uuid;
create function battlemap_room.scene_published(scene_id text) returns boolean language sql stable set search_path to '' as $$
 select scene_id is null or exists(select 1 from battlemap_room.gm_workspace w cross join lateral jsonb_array_elements(w.value) e where w.key='battlemap.scenes.v1' and e->>'id'=scene_id and e->'published'='true'::jsonb);
$$;
create function battlemap_room.tag_test_event() returns trigger language plpgsql set search_path to '' as $$
begin
 select test_id into new.test_id from battlemap_room.state where id;
 return new;
end;
$$;
create trigger tag_test_event before insert on battlemap_room.events for each row execute function battlemap_room.tag_test_event();
CREATE OR REPLACE FUNCTION battlemap_room.viewer(ticket uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when exists(select 1 from battlemap_room.state s where s.gm_token=ticket and s.heartbeat>now()-interval '65 seconds') then 'gm'
  when exists(select 1 from battlemap_room.players a join battlemap_room.profiles p on p.name=a.profile and p.approved where a.token=ticket and exists(select 1 from battlemap_room.state s where s.id and (case when s.test_id is not null then p.can_test and p.password_hash is not null else battlemap_room.scene_published(s.active_scene_id) end))) then 'player' end;
$function$;
CREATE OR REPLACE FUNCTION battlemap_room.player_scene_state(since_revision bigint DEFAULT '-1'::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'gmOnline',coalesce(s.heartbeat>now()-interval '65 seconds',false),
 'paused',s.paused,'revision',s.revision,'title',s.title,
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'characters',coalesce((
  select jsonb_agg(jsonb_build_object('id',c.standee_id,'name',c.character_name) order by c.character_name,c.standee_id)
  from battlemap_room.controllers c where c.profile=p.name
 ),'[]'::jsonb)) order by p.name) from battlemap_room.profiles p where p.approved),'[]'::jsonb),
 'scene',case when s.scene is not null and s.revision<>since_revision then
  jsonb_build_object('pieces',s.scene->'pieces','areas',coalesce((select jsonb_agg(a order by ord) from jsonb_array_elements(coalesce(s.scene->'areas','[]')) with ordinality q(a,ord) where a->>'shape' <> 'opening' or a->>'secret' is distinct from 'true'),'[]'),'tokens',coalesce((
   select jsonb_agg((case when v.role='enemy' then t - array['hp','maxHp','tempHp','ac','saveDc','initiativeModifier','hpPoolId'] else t end)
    || jsonb_build_object('role',v.role,'controllerNames',m.names) order by ord)
   from jsonb_array_elements(s.scene->'tokens') with ordinality as tt(t,ord)
   cross join lateral (select coalesce(jsonb_agg(c.profile order by c.profile),'[]'::jsonb) names from battlemap_room.controllers c join battlemap_room.profiles p on p.name=c.profile and p.approved where c.standee_id=t->>'roomId') m
   cross join lateral (select case when coalesce(t->>'baseRole',t->>'role','enemy')='enemy' and jsonb_array_length(m.names)>0 then 'ally' else coalesce(t->>'baseRole',t->>'role','enemy') end as role) v
   where coalesce(t->>'incognito','false')<>'true'
  ),'[]'::jsonb)) else null end,
 'active',s.scene is not null
 ) from battlemap_room.state s;
$function$;
revoke execute on function battlemap_room.player_scene_state(bigint) from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.battlemap_room_state(since_revision bigint DEFAULT '-1'::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'gmOnline',coalesce(s.heartbeat>now()-interval '65 seconds',false),
 'paused',s.paused,'revision',s.revision,'title',case when s.test_id is null and battlemap_room.scene_published(s.active_scene_id) then s.title end,
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'passwordRequired',p.password_hash is not null,'characters',coalesce((
  select jsonb_agg(jsonb_build_object('id',c.standee_id,'name',c.character_name) order by c.character_name,c.standee_id)
  from battlemap_room.controllers c where c.profile=p.name
 ),'[]'::jsonb)) order by p.name) from battlemap_room.profiles p where p.approved),'[]'::jsonb),
 'scene',case when s.test_id is null and battlemap_room.scene_published(s.active_scene_id) and s.scene is not null and s.revision<>since_revision then
  jsonb_build_object('pieces',s.scene->'pieces','areas',coalesce((select jsonb_agg(a order by ord) from jsonb_array_elements(coalesce(s.scene->'areas','[]')) with ordinality q(a,ord) where a->>'shape' <> 'opening' or a->>'secret' is distinct from 'true'),'[]'),'tokens',coalesce((
   select jsonb_agg((case when v.role='enemy' then t - array['hp','maxHp','tempHp','ac','saveDc','initiativeModifier','hpPoolId'] else t end)
    || jsonb_build_object('role',v.role,'controllerNames',m.names) order by ord)
   from jsonb_array_elements(s.scene->'tokens') with ordinality as tt(t,ord)
   cross join lateral (select coalesce(jsonb_agg(c.profile order by c.profile),'[]'::jsonb) names from battlemap_room.controllers c join battlemap_room.profiles p on p.name=c.profile and p.approved where c.standee_id=t->>'roomId') m
   cross join lateral (select case when coalesce(t->>'baseRole',t->>'role','enemy')='enemy' and jsonb_array_length(m.names)>0 then 'ally' else coalesce(t->>'baseRole',t->>'role','enemy') end as role) v
   where coalesce(t->>'incognito','false')<>'true'
  ),'[]'::jsonb)) else null end,
 'active',s.test_id is null and battlemap_room.scene_published(s.active_scene_id) and s.scene is not null
 ) from battlemap_room.state s;
$function$;
CREATE OR REPLACE FUNCTION public.battlemap_room_login(player_name text, character_key text, character_display text, gm_password text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pname text:=trim(player_name); chosen text:=coalesce(trim(character_key),''); ticket uuid:=gen_random_uuid(); label text; account battlemap_room.profiles%rowtype;
begin
 if lower(pname)='gm1000' then return public.battlemap_room_legacy_login(pname,null,null,gm_password);end if;
 select * into account from battlemap_room.profiles p where p.name=pname and p.approved for update;
 if not found then return jsonb_build_object('error','Choose a name added by the GM.');end if;
 if account.password_hash is not null then
  if account.password_attempt>clock_timestamp()-interval '2 seconds' then return jsonb_build_object('error','Wait a moment before retrying.');end if;
  if gm_password is null or octet_length(gm_password)>72 or extensions.crypt(gm_password,account.password_hash) is distinct from account.password_hash then
   update battlemap_room.profiles set password_attempt=clock_timestamp() where name=pname;
   return jsonb_build_object('error','Incorrect account password.');
  end if;
  update battlemap_room.profiles set password_attempt=null where name=pname;
 end if;
 select c.character_name into label from battlemap_room.controllers c where c.profile=pname and c.standee_id=chosen;
 if label is null and (chosen<>'' or exists(select 1 from battlemap_room.controllers c where c.profile=pname)) then
  return jsonb_build_object('error','Choose a character assigned by the GM.');
 end if;
 insert into battlemap_room.players(token,profile,character_key,display_name) values(ticket,pname,chosen,left(coalesce(nullif(trim(character_display),''),label,''),80));
 return jsonb_build_object('token',ticket,'gm',false);
end $function$;
CREATE OR REPLACE FUNCTION public.battlemap_room_legacy_login(player_name text, character_key text, character_display text, gm_password text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.state%rowtype; ticket uuid:=gen_random_uuid(); pname text:=trim(player_name);
begin
 if pname is null or length(pname) not between 1 and 60 then return jsonb_build_object('error','Choose a name.'); end if;
 if lower(pname)='gm1000' then
  select * into st from battlemap_room.state where id for update;
  if st.last_attempt>clock_timestamp()-interval '1 second' then return jsonb_build_object('error','Wait a moment before retrying.'); end if;
  update battlemap_room.state set last_attempt=clock_timestamp() where id;
  if gm_password is null or length(gm_password)>100 or extensions.crypt(gm_password,st.verifier)<>st.verifier then
   return jsonb_build_object('error','Incorrect GM password.');
  end if;
  if st.heartbeat>now()-interval '65 seconds' then return jsonb_build_object('error','The GM is already online.'); end if;
  update battlemap_room.state set gm_token=ticket,heartbeat=now() where id;
  return jsonb_build_object('token',ticket,'gm',true);
 end if;
 return public.battlemap_room_login(pname,character_key,character_display,gm_password);
end $function$;
CREATE OR REPLACE FUNCTION public.battlemap_room_accounts(ticket uuid, operation text, account_name text, assignments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.state%rowtype; pname text:=trim(account_name); account battlemap_room.profiles%rowtype; next_hash text; tester boolean;
begin
 select * into st from battlemap_room.state where id for update;
 if ticket is null or ticket is distinct from st.gm_token or st.heartbeat is null or st.heartbeat<now()-interval '65 seconds' then return jsonb_build_object('error','GM session expired.');end if;
 if pname is null or length(pname) not between 1 and 60 or lower(pname)='gm1000' or pname='__new' then return jsonb_build_object('error','Choose a valid player name.');end if;
 if operation='add' then
  insert into battlemap_room.profiles(name,character_name,approved) values(pname,'',true) on conflict(name) do update set approved=true;
 elsif operation in ('access','get_access') then
  select * into account from battlemap_room.profiles p where p.name=pname and p.approved for update;
  if not found then return jsonb_build_object('error','Add that account first.');end if;
  if operation='get_access' then return jsonb_build_object('canTest',account.can_test,'passwordRequired',account.password_hash is not null);end if;
  if jsonb_typeof(assignments->'canTest') is distinct from 'boolean' then return jsonb_build_object('error','Invalid test permission.');end if;
  tester:=(assignments->>'canTest')::boolean;
  next_hash:=account.password_hash;
  if assignments->>'password' is not null then
   if octet_length(assignments->>'password') not between 8 and 72 then return jsonb_build_object('error','Use a password of 8–72 bytes.');end if;
   next_hash:=extensions.crypt(assignments->>'password',extensions.gen_salt('bf',10));
  elsif assignments->'clearPassword'='true'::jsonb then
   next_hash:=null;
  end if;
  if tester and next_hash is null then return jsonb_build_object('error','Set a password before granting test-scene access.');end if;
  update battlemap_room.profiles set password_hash=next_hash,can_test=tester,password_attempt=null where name=pname;
  if next_hash is distinct from account.password_hash then delete from battlemap_room.players where profile=pname;end if;
  perform battlemap_room.emit('status','{}'::jsonb);
 elsif operation='assign' then
  if not exists(select 1 from battlemap_room.profiles p where p.name=pname and p.approved) then return jsonb_build_object('error','Add that account first.');end if;
  if jsonb_typeof(assignments) is distinct from 'array' or jsonb_array_length(assignments)>500 or exists(
   select 1 from jsonb_array_elements(assignments) j where coalesce(j->>'id','') !~ '^[0-9a-f-]{36}$' or length(coalesce(j->>'name','')) not between 1 and 80 or jsonb_typeof(j->'allowed') is distinct from 'boolean'
  ) then return jsonb_build_object('error','Invalid standee assignments.');end if;
  delete from battlemap_room.controllers c where c.profile=pname and c.standee_id in (select j->>'id' from jsonb_array_elements(assignments) j);
  insert into battlemap_room.controllers(profile,standee_id,character_name)
   select pname,j->>'id',j->>'name' from jsonb_array_elements(assignments) j where (j->>'allowed')::boolean
   on conflict(profile,standee_id) do update set character_name=excluded.character_name;
  update battlemap_room.state set revision=revision+1 where id;
 else return jsonb_build_object('error','Unknown account action.');
 end if;
 return jsonb_build_object('ok',true);
end $function$;
CREATE OR REPLACE FUNCTION public.battlemap_room_gm(ticket uuid, operation text, payload jsonb DEFAULT NULL::jsonb, scene_title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.state%rowtype;
begin
 select * into st from battlemap_room.state where id for update;
 if ticket is null or st.gm_token is distinct from ticket or st.heartbeat is null or st.heartbeat<now()-interval '65 seconds' then
  return jsonb_build_object('error','GM session expired.');
 end if;
 if operation='activate' then
  if current_setting('battlemap.activating',true) is distinct from 'yes' then return jsonb_build_object('error','Use the Scene Manager to start a scene.');end if;
  if payload is null or jsonb_typeof(payload->'pieces') is distinct from 'array' or jsonb_typeof(payload->'tokens') is distinct from 'array' or pg_column_size(payload)>12000000 then return jsonb_build_object('error','Scene is invalid or larger than 12 MB.'); end if;
  update battlemap_room.state set scene=payload,title=left(coalesce(scene_title,'Battlemap'),80),revision=revision+1,heartbeat=now() where id;
 elsif operation in ('pause','resume') then
  if st.scene is null then return jsonb_build_object('error','Activate a scene first.'); end if;
  update battlemap_room.state set paused=(operation='pause'),heartbeat=now() where id;
 elsif operation='logout' then
  update battlemap_room.state set gm_token=null,heartbeat=null where id;
 elsif operation='heartbeat' then
  update battlemap_room.state set heartbeat=now() where id;
 else return jsonb_build_object('error','Unknown action.');
 end if;
 return jsonb_build_object('ok',true);
end $function$;
CREATE OR REPLACE FUNCTION public.battlemap_room_move(ticket uuid, token_id text, px numeric, py numeric, pz numeric, expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.state%rowtype; player battlemap_room.players%rowtype; obj jsonb; idx integer; sz integer;
begin
 select * into st from battlemap_room.state where id for update;
 if battlemap_room.viewer(ticket) is distinct from 'player' then return jsonb_build_object('error','This scene is unavailable.');end if;
 if st.paused or st.scene is null then return jsonb_build_object('error','The scene is paused.'); end if;
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
 update battlemap_room.state set scene=jsonb_set(st.scene,array['tokens',idx::text],obj||jsonb_build_object('x',px,'y',py,'z',pz)),revision=revision+1 where id;
 return jsonb_build_object('ok',true,'revision',st.revision+1);
end $function$;
CREATE OR REPLACE FUNCTION public.battlemap_room_publish(ticket uuid, operation text, payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare role_name text:=battlemap_room.viewer(ticket); st battlemap_room.state%rowtype; bucket text; c jsonb; next_scene jsonb; items jsonb; actor battlemap_room.players%rowtype; sender text; scene_id text; result jsonb;
begin
 select * into st from battlemap_room.state where id for update;
 role_name:=battlemap_room.viewer(ticket);
 if role_name is null then return jsonb_build_object('error','This scene is unavailable.');end if;
 if role_name='gm' and (st.gm_token is distinct from ticket or st.heartbeat<now()-interval '65 seconds') then return jsonb_build_object('error','GM session expired.');end if;
 if operation in ('activate','test') and role_name='gm' then
  scene_id:=payload->>'sceneId';
  if scene_id is null or not exists(
   select 1 from battlemap_room.gm_workspace w cross join lateral jsonb_array_elements(w.value) entry
   where w.key='battlemap.scenes.v1' and entry->>'id'=scene_id
  ) then return jsonb_build_object('error','Save or load a scene in Scene Manager first.');end if;
  if operation='activate' and (st.test_id is not null or not battlemap_room.scene_published(scene_id)) then
   return jsonb_build_object('error','End the test and publish the scene before activating it.');
  end if;
  if operation='test' and st.test_id is not null then return jsonb_build_object('error','End the current test first.');end if;
  if payload->'scene' is null or jsonb_typeof(payload->'scene'->'pieces') is distinct from 'array' or jsonb_typeof(payload->'scene'->'tokens') is distinct from 'array' or pg_column_size(payload->'scene')>12000000 then
   return jsonb_build_object('error','Scene is invalid or larger than 12 MB.');
  end if;
  update battlemap_room.state set active_scene_id=scene_id,paused=true,
   test_id=case when operation='test' then gen_random_uuid() end,
   suspended_live=case when operation='test' then jsonb_build_object('scene',st.scene,'title',st.title,'paused',st.paused,'initiative',st.initiative,'sceneId',st.active_scene_id) end,
   initiative=jsonb_build_object('entries','[]'::jsonb,'active',null,'round',1)
  where id;
  perform set_config('battlemap.activating','yes',true);
  result:=public.battlemap_room_gm(ticket,'activate',payload->'scene',payload->>'title');
  perform set_config('battlemap.activating','no',true);
  return result;
 elsif operation='stop_test' and role_name='gm' then
  if st.test_id is null then return jsonb_build_object('error','No test is running.');end if;
  perform set_config('battlemap.activating','yes',true);
  update battlemap_room.state set
   scene=nullif(st.suspended_live->'scene','null'::jsonb),
   title=coalesce(st.suspended_live->>'title','Battlemap'),
   initiative=coalesce(st.suspended_live->'initiative','{"entries":[],"round":1}'::jsonb),
   paused=coalesce((st.suspended_live->>'paused')::boolean,true),
   active_scene_id=st.suspended_live->>'sceneId',test_id=null,suspended_live=null,
   revision=revision+1
  where id;
  perform set_config('battlemap.activating','no',true);
  return jsonb_build_object('ok',true);
 elsif operation='patch' and role_name='gm' then
  if st.scene is null or (payload->>'revision')::bigint is distinct from st.revision then return jsonb_build_object('error','The scene changed. Try again.');end if;
  if jsonb_typeof(payload->'changes') is distinct from 'array' or jsonb_array_length(payload->'changes')>5000 or pg_column_size(payload)>12000000 then return jsonb_build_object('error','Invalid scene changes.');end if;
  next_scene:=st.scene;
  foreach bucket in array array['pieces','tokens','areas'] loop
   with delta as (select j->>'id' id,j->'item' item from jsonb_array_elements(payload->'changes') j where j->>'bucket'=bucket)
   select coalesce(jsonb_agg(v.item order by v.ord),'[]') into items from (
    select coalesce(d.item,t.item) item,t.ord from jsonb_array_elements(coalesce(st.scene->bucket,'[]')) with ordinality t(item,ord) left join delta d on d.id=t.item->>'roomId'
    union all select d.item,100000+row_number() over() from delta d where not exists(select 1 from jsonb_array_elements(coalesce(st.scene->bucket,'[]')) t where t->>'roomId'=d.id)
   ) v where v.item<>'null'::jsonb;
   next_scene:=jsonb_set(next_scene,array[bucket],items,true);
  end loop;
  if next_scene is distinct from st.scene then update battlemap_room.state set scene=next_scene,revision=revision+1 where id;end if;
 elsif operation='initiative' and role_name='gm' then
  if jsonb_typeof(payload->'entries') is distinct from 'array' or pg_column_size(payload)>60000 then return jsonb_build_object('error','Invalid initiative order.');end if;
  update battlemap_room.state set initiative=payload where id;
  perform battlemap_room.emit('initiative','{}');
 elsif operation='clear_chat' and role_name='gm' then
  delete from battlemap_room.events where kind='chat' and test_id is not distinct from st.test_id;
  perform battlemap_room.emit('clear_chat','{}');
 elsif operation in ('chat','ping') then
  if payload is null or pg_column_size(payload)>25000 then return jsonb_build_object('error','That entry is too large.');end if;
  if role_name='gm' then sender:='GM';else
   select * into actor from battlemap_room.players where token=ticket;
   sender:=coalesce(nullif(actor.display_name,''),actor.profile);
  end if;
  if operation='chat' then
   perform battlemap_room.emit('chat',jsonb_build_object('card',payload->'card','sender',sender),coalesce(payload->>'audience','')='gm');
   if role_name='player' and jsonb_typeof(payload->'initiative')='object' and coalesce(payload->>'audience','')<>'gm' then
    declare chosen jsonb; score numeric; k text; updated_entries jsonb;
    begin
     score:=(payload->'initiative'->>'total')::numeric;
     select t into chosen from jsonb_array_elements(coalesce(st.scene->'tokens','[]')) t where t->>'roomId'=actor.character_key and coalesce(t->>'incognito','false')<>'true'
      and exists(select 1 from battlemap_room.controllers c where c.profile=actor.profile and c.standee_id=actor.character_key);
     if chosen is not null and score between -99 and 999 then
      k:=coalesce(chosen->>'initiativeKey',chosen->>'roomId');
      updated_entries:=coalesce((select jsonb_agg(e) from jsonb_array_elements(st.initiative->'entries') e where e->>0<>k),'[]')||jsonb_build_array(jsonb_build_array(k,jsonb_build_object('name',sender,'total',score,'roomId',chosen->>'roomId')));
      update battlemap_room.state set initiative=jsonb_set(st.initiative,'{entries}',updated_entries) where id;
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
CREATE OR REPLACE FUNCTION public.battlemap_room_sync(ticket uuid, since_event bigint DEFAULT '-1'::integer, snapshot boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare role_name text; st battlemap_room.state%rowtype; latest bigint; oldest bigint; entries jsonb; reset boolean; online jsonb; blocked boolean;
begin
 select * into st from battlemap_room.state where id for share;
 role_name:=battlemap_room.viewer(ticket);
 if role_name is null and not exists(select 1 from battlemap_room.players a join battlemap_room.profiles p on p.name=a.profile and p.approved where a.token=ticket) then
  return jsonb_build_object('error','Choose your profile again.');
 end if;
 blocked:=role_name is null;
 if role_name='player' then
  update battlemap_room.players set updated=now() where token=ticket and updated<now()-interval '5 seconds';
 elsif role_name='gm' then
  select coalesce(jsonb_agg(profile order by lower(profile)),'[]'::jsonb) into online
   from (select distinct a.profile from battlemap_room.players a join battlemap_room.profiles p on p.name=a.profile and p.approved
    where a.updated>now()-interval '65 seconds') names;
 end if;
 select version into latest from public.battlemap_room_signal where id;
 if blocked then
  return jsonb_build_object('cursor',latest,'reset',true,'events','[]'::jsonb,'revision',st.revision,
   'active',false,'paused',true,'testing',false,'title',null,'gmOnline',coalesce(st.heartbeat>now()-interval '65 seconds',false),
   'initiative',jsonb_build_object('entries','[]'::jsonb,'active',null,'round',1));
 end if;
 select min(id) into oldest from battlemap_room.events where test_id is not distinct from st.test_id;
 reset:=since_event<0 or (oldest is not null and since_event<oldest-1) or exists(select 1 from battlemap_room.events where id>since_event and id<=latest and kind='reset' and test_id is not distinct from st.test_id);
 if reset then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'at',created_at) order by id),'[]') into entries
  from (select * from battlemap_room.events where kind='chat' and test_id is not distinct from st.test_id and (not gm_only or role_name='gm') order by id desc limit 50) q;
 else
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',case when kind='delta' and role_name<>'gm' then
   body||jsonb_build_object('changes',coalesce((select jsonb_agg(c||jsonb_build_object('item',case when c->'item'='null' then null else battlemap_room.player_token(c->'item') end)) from jsonb_array_elements(body->'changes') c where c->>'bucket'='tokens'),'[]')||
   coalesce((select jsonb_agg(c) from jsonb_array_elements(body->'changes') c where c->>'bucket'<>'tokens'),'[]'))
   else body end,'at',created_at) order by id),'[]') into entries
  from battlemap_room.events where id>since_event and id<=latest and test_id is not distinct from st.test_id and (not gm_only or role_name='gm') and (kind<>'ping' or created_at>now()-interval '7 seconds');
 end if;
 return jsonb_build_object('cursor',latest,'reset',reset,'events',entries,'revision',st.revision,'active',st.scene is not null,'title',st.title,'testing',st.test_id is not null,'sceneId',st.active_scene_id,
 'paused',st.paused,'gmOnline',coalesce(st.heartbeat>now()-interval '65 seconds',false),
 'initiative',case when role_name='gm' then st.initiative else battlemap_room.public_initiative(st.initiative,st.scene) end,
 'onlinePlayers',online,'scene',case when (snapshot or reset) and st.scene is not null then case when role_name='gm' then st.scene else battlemap_room.player_scene_state(-1)->'scene' end else null end);
end $function$;
