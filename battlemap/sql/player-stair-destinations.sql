-- Match browser stair and low-step landings in both directions.
-- The standee's square is a control area; keep its supported center clear of terrain.
-- Creature collision, ownership, pause, revision and actual map bounds remain enforced.

CREATE OR REPLACE FUNCTION public.battlemap_room_move(ticket uuid, token_id text, px numeric, py numeric, pz numeric, expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.state%rowtype; player battlemap_room.players%rowtype; obj jsonb; idx integer; sz integer; on_stair boolean; on_landing boolean; scene_grid jsonb; map_width numeric:=40; map_depth numeric:=40;
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
 on_stair:=exists(
   select 1 from jsonb_array_elements(st.scene->'pieces') t
   where coalesce(t->>'stairTread'='true',false) and t->>'type'='volume' and t->>'form' is null
    and pz=(t->>'z')::numeric+coalesce((t->'extents'->>2)::numeric,1)
    and px+sz/2.0>=(t->>'x')::numeric
    and px+sz/2.0<(t->>'x')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then coalesce((t->'extents'->>1)::numeric,2) else coalesce((t->'extents'->>0)::numeric,2) end
    and py+sz/2.0>=(t->>'y')::numeric
    and py+sz/2.0<(t->>'y')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then coalesce((t->'extents'->>0)::numeric,2) else coalesce((t->'extents'->>1)::numeric,2) end
  );
 on_landing:=on_stair or (coalesce(obj->>'flying','false')<>'true' and pz<>(obj->>'z')::numeric and abs(pz-(obj->>'z')::numeric)<=1 and (pz=0 or exists(
   select 1 from jsonb_array_elements(st.scene->'pieces') t
   join (values ('terrace',3,2,1),('stone',2,2,2),('pillar',1,1,3),('bridge',3,1,1),('crate',1,1,1),('fountain',1,1,1),('volume',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>'type'
   cross join lateral (select
    case when defaults.kind='volume' then coalesce((t->'extents'->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind='volume' then coalesce((t->'extents'->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind='volume' then coalesce((t->'extents'->>2)::numeric,defaults.h) else defaults.h end h
   ) v
   where t->>'form' is null and pz=(t->>'z')::numeric+v.h
    and px+sz/2.0>=(t->>'x')::numeric
    and px+sz/2.0<(t->>'x')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then v.d else v.w end
    and py+sz/2.0>=(t->>'y')::numeric
    and py+sz/2.0<(t->>'y')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then v.w else v.d end
  )));
 select a->'grid' into scene_grid from jsonb_array_elements(coalesce(st.scene->'areas','[]'::jsonb)) a where a->>'shape'='appearance' limit 1;
 if jsonb_typeof(scene_grid->'width')='number' and jsonb_typeof(scene_grid->'depth')='number' then
  if (scene_grid->>'width')::numeric between 10 and 100 and (scene_grid->>'depth')::numeric between 10 and 100
    and trunc((scene_grid->>'width')::numeric)=(scene_grid->>'width')::numeric
    and trunc((scene_grid->>'depth')::numeric)=(scene_grid->>'depth')::numeric then
   map_width:=(scene_grid->>'width')::numeric;map_depth:=(scene_grid->>'depth')::numeric;
  end if;
 end if;
 if px is null or py is null or pz is null or mod(px*8,1)<>0 or mod(py*8,1)<>0 or mod(pz*4,1)<>0 or px<0 or py<0 or pz<0 or px+sz>map_width or py+sz>map_depth or pz>11 or
    (obj->>'flying'='true' and pz<>(obj->>'z')::numeric) then return jsonb_build_object('error','That destination is outside the map.'); end if;
 if exists(
  select 1 from (
   select (t->>'x')::numeric x,(t->>'y')::numeric y,(t->>'z')::numeric z,(t->>'size')::int w,(t->>'size')::int d,1 h,false terrain,false narrow,false stairs
    from jsonb_array_elements(st.scene->'tokens') t where t->>'roomId' is distinct from token_id and not coalesce(t->'conditions' ? 'dead',false) and not coalesce(obj->'conditions' ? 'dead',false)
   union all
   select (t->>'x')::numeric,(t->>'y')::numeric,(t->>'z')::numeric,
    case when coalesce((t->>'r')::int,0)%2=1 then v.d else v.w end,
    case when coalesce((t->>'r')::int,0)%2=1 then v.w else v.d end,v.h,true,(defaults.kind='wall' or (defaults.kind='volume' and v.h>1 and least(v.w,v.d)<=.5 and not coalesce(t->>'stairTread'='true',false) and t->>'form' is null)),coalesce(t->>'stairTread'='true',false)
   from jsonb_array_elements(st.scene->'pieces') t join (values ('terrace',3,2,1),('stone',2,2,2),('wall',3,1,2),('pillar',1,1,3),('bridge',3,1,1),('crate',1,1,1),('fountain',1,1,1),('stream',3,1,0),('waterfall',2,1,2),('volume',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>'type'
   cross join lateral (select
    case when defaults.kind='volume' then coalesce((t->'extents'->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind='volume' then coalesce((t->'extents'->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind='volume' then coalesce((t->'extents'->>2)::numeric,defaults.h) else defaults.h end h
   ) v
  ) q where px<q.x+q.w and px+sz>q.x and py<q.y+q.d and py+sz>q.y and pz<q.z+q.h and pz+1>q.z
   and not (q.terrain and q.h<=1 and q.z+q.h<=pz+1 and (sz>=3 or coalesce(obj->>'flying'='true',false)))
   and not (on_landing and q.terrain and (px+sz/2.0<q.x or px+sz/2.0>=q.x+q.w or py+sz/2.0<q.y or py+sz/2.0>=q.y+q.d))
   and not (q.stairs and (px+sz/2.0<q.x or px+sz/2.0>=q.x+q.w or py+sz/2.0<q.y or py+sz/2.0>=q.y+q.d))
   and not (q.narrow and (case when q.w<q.d then px+sz/2.0<q.x or px+sz/2.0>=q.x+q.w else py+sz/2.0<q.y or py+sz/2.0>=q.y+q.d end))
 ) then return jsonb_build_object('error','That destination is occupied.'); end if;
 if pz>0 and coalesce(obj->>'flying','false')<>'true' and not on_landing and exists(
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

CREATE OR REPLACE FUNCTION public.battlemap_scene_move(ticket uuid, requested_scene text, token_id text, px numeric, py numeric, pz numeric, expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.encounters%rowtype; player battlemap_room.players%rowtype; obj jsonb; idx integer; sz integer; on_stair boolean; on_landing boolean; scene_grid jsonb; map_width numeric:=40; map_depth numeric:=40;
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
 on_stair:=exists(
   select 1 from jsonb_array_elements(st.scene->'pieces') t
   where coalesce(t->>'stairTread'='true',false) and t->>'type'='volume' and t->>'form' is null
    and pz=(t->>'z')::numeric+coalesce((t->'extents'->>2)::numeric,1)
    and px+sz/2.0>=(t->>'x')::numeric
    and px+sz/2.0<(t->>'x')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then coalesce((t->'extents'->>1)::numeric,2) else coalesce((t->'extents'->>0)::numeric,2) end
    and py+sz/2.0>=(t->>'y')::numeric
    and py+sz/2.0<(t->>'y')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then coalesce((t->'extents'->>0)::numeric,2) else coalesce((t->'extents'->>1)::numeric,2) end
  );
 on_landing:=on_stair or (coalesce(obj->>'flying','false')<>'true' and pz<>(obj->>'z')::numeric and abs(pz-(obj->>'z')::numeric)<=1 and (pz=0 or exists(
   select 1 from jsonb_array_elements(st.scene->'pieces') t
   join (values ('terrace',3,2,1),('stone',2,2,2),('pillar',1,1,3),('bridge',3,1,1),('crate',1,1,1),('fountain',1,1,1),('volume',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>'type'
   cross join lateral (select
    case when defaults.kind='volume' then coalesce((t->'extents'->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind='volume' then coalesce((t->'extents'->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind='volume' then coalesce((t->'extents'->>2)::numeric,defaults.h) else defaults.h end h
   ) v
   where t->>'form' is null and pz=(t->>'z')::numeric+v.h
    and px+sz/2.0>=(t->>'x')::numeric
    and px+sz/2.0<(t->>'x')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then v.d else v.w end
    and py+sz/2.0>=(t->>'y')::numeric
    and py+sz/2.0<(t->>'y')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then v.w else v.d end
  )));
 select a->'grid' into scene_grid from jsonb_array_elements(coalesce(st.scene->'areas','[]'::jsonb)) a where a->>'shape'='appearance' limit 1;
 if jsonb_typeof(scene_grid->'width')='number' and jsonb_typeof(scene_grid->'depth')='number' then
  if (scene_grid->>'width')::numeric between 10 and 100 and (scene_grid->>'depth')::numeric between 10 and 100
    and trunc((scene_grid->>'width')::numeric)=(scene_grid->>'width')::numeric
    and trunc((scene_grid->>'depth')::numeric)=(scene_grid->>'depth')::numeric then
   map_width:=(scene_grid->>'width')::numeric;map_depth:=(scene_grid->>'depth')::numeric;
  end if;
 end if;
 if px is null or py is null or pz is null or mod(px*8,1)<>0 or mod(py*8,1)<>0 or mod(pz*4,1)<>0 or px<0 or py<0 or pz<0 or px+sz>map_width or py+sz>map_depth or pz>11 or
    (obj->>'flying'='true' and pz<>(obj->>'z')::numeric) then return jsonb_build_object('error','That destination is outside the map.'); end if;
 if exists(
  select 1 from (
   select (t->>'x')::numeric x,(t->>'y')::numeric y,(t->>'z')::numeric z,(t->>'size')::int w,(t->>'size')::int d,1 h,false terrain,false narrow,false stairs
    from jsonb_array_elements(st.scene->'tokens') t where t->>'roomId' is distinct from token_id
   union all
   select (t->>'x')::numeric,(t->>'y')::numeric,(t->>'z')::numeric,
    case when coalesce((t->>'r')::int,0)%2=1 then v.d else v.w end,
    case when coalesce((t->>'r')::int,0)%2=1 then v.w else v.d end,v.h,true,(defaults.kind='wall' or (defaults.kind='volume' and v.h>1 and least(v.w,v.d)<=.5 and not coalesce(t->>'stairTread'='true',false) and t->>'form' is null)),coalesce(t->>'stairTread'='true',false)
   from jsonb_array_elements(st.scene->'pieces') t join (values ('terrace',3,2,1),('stone',2,2,2),('wall',3,1,2),('pillar',1,1,3),('bridge',3,1,1),('crate',1,1,1),('fountain',1,1,1),('stream',3,1,0),('waterfall',2,1,2),('volume',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>'type'
   cross join lateral (select
    case when defaults.kind='volume' then coalesce((t->'extents'->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind='volume' then coalesce((t->'extents'->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind='volume' then coalesce((t->'extents'->>2)::numeric,defaults.h) else defaults.h end h
   ) v
  ) q where px<q.x+q.w and px+sz>q.x and py<q.y+q.d and py+sz>q.y and pz<q.z+q.h and pz+1>q.z
   and not (q.terrain and q.h<=1 and q.z+q.h<=pz+1 and (sz>=3 or coalesce(obj->>'flying'='true',false)))
   and not (on_landing and q.terrain and (px+sz/2.0<q.x or px+sz/2.0>=q.x+q.w or py+sz/2.0<q.y or py+sz/2.0>=q.y+q.d))
   and not (q.stairs and (px+sz/2.0<q.x or px+sz/2.0>=q.x+q.w or py+sz/2.0<q.y or py+sz/2.0>=q.y+q.d))
   and not (q.narrow and (case when q.w<q.d then px+sz/2.0<q.x or px+sz/2.0>=q.x+q.w else py+sz/2.0<q.y or py+sz/2.0>=q.y+q.d end))
 ) then return jsonb_build_object('error','That destination is occupied.'); end if;
 if pz>0 and coalesce(obj->>'flying','false')<>'true' and not on_landing and exists(
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
