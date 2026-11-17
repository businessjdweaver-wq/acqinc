create table battlemap_room.scene_preload_queue (
 singleton boolean primary key default true check (singleton),
 scene_ids jsonb not null
);
alter table battlemap_room.scene_preload_queue enable row level security;

create function public.battlemap_room_scene_preload(ticket uuid, queue_ids jsonb default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
 viewer text := battlemap_room.scene_viewer(ticket,null);
 ids jsonb;
 assets jsonb;
begin
 if viewer is null or (queue_ids is not null and viewer <> 'gm') then
  return jsonb_build_object('error','This preload queue is unavailable.');
 end if;
 if queue_ids is not null then
  if jsonb_typeof(queue_ids) <> 'array' or jsonb_array_length(queue_ids)>100
   or exists(select 1 from jsonb_array_elements(queue_ids) e where jsonb_typeof(e)<>'string' or length(e#>>'{}')>120) then
   return jsonb_build_object('error','Invalid scene preload queue.');
  end if;
  insert into battlemap_room.scene_preload_queue(singleton,scene_ids) values(true,queue_ids)
   on conflict(singleton) do update set scene_ids=excluded.scene_ids;
 end if;
 select scene_ids into ids from battlemap_room.scene_preload_queue where singleton;
 if viewer='gm' then return jsonb_build_object('queue',ids); end if;

 select coalesce(jsonb_agg(src order by first_scene),'[]'::jsonb) into assets
 from (
  select src,min(q.ordinality) as first_scene
  from jsonb_array_elements_text(coalesce(ids,'[]'::jsonb)) with ordinality q(id,ordinality)
  join battlemap_room.gm_workspace w on w.key='battlemap.scenes.v1'
  cross join lateral jsonb_array_elements(w.value) scene
  cross join lateral (
   select a->'appearance'->>'groundImage' as src from jsonb_array_elements(coalesce(scene->'map'->'areas','[]'::jsonb)) a where a->>'shape'='appearance'
   union all
   select a->'appearance'->>'backdropImage' from jsonb_array_elements(coalesce(scene->'map'->'areas','[]'::jsonb)) a where a->>'shape'='appearance'
   union all
   select coalesce(t->'looks'->(case when t->>'activeLook' ~ '^[0-9]{1,4}$' then (t->>'activeLook')::int end)->>'front',t->>'src')
   from jsonb_array_elements(coalesce(scene->'map'->'tokens','[]'::jsonb)) t
   where coalesce(t->>'baseRole',t->>'role')='pc' and t->>'incognito' is distinct from 'true'
  ) art
  where scene->>'id'=q.id and scene->'published'='true'::jsonb
   and src like 'https://%' and length(src)<=2048
  group by src order by first_scene limit 200
 ) clean;
 return jsonb_build_object('assets',assets);
end
$$;
revoke all on function public.battlemap_room_scene_preload(uuid,jsonb) from public;
grant execute on function public.battlemap_room_scene_preload(uuid,jsonb) to anon,authenticated;
