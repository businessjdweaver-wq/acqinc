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
 'scene',case when s.test_id is null and battlemap_room.scene_published(s.active_scene_id) and s.scene is not null and since_revision<9007199254740991 and s.revision<>since_revision then
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
