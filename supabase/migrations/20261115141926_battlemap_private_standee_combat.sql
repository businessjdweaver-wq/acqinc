
create table battlemap_room.standee_combat (
 scene_id text not null,
 standee_id text not null,
 details jsonb not null,
 primary key(scene_id,standee_id)
);
alter table battlemap_room.standee_combat enable row level security;

create function public.battlemap_room_standee_combat(ticket uuid, scene_key text, changes jsonb default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
 perform 1 from battlemap_room.state where id for share;
 if battlemap_room.viewer(ticket) is distinct from 'gm' then
  return jsonb_build_object('error','Sign in as GM to access standee combat stats.');
 end if;
 if scene_key is null or length(scene_key) not between 1 and 120 then
  return jsonb_build_object('error','Save the scene before saving standee combat stats.');
 end if;
 if changes is null then
  return coalesce((select jsonb_object_agg(entry.standee_id,entry.details)
   from battlemap_room.standee_combat entry where entry.scene_id=scene_key),'{}'::jsonb);
 end if;
 if jsonb_typeof(changes) is distinct from 'object' or pg_column_size(changes)>8000000 then
  return jsonb_build_object('error','Invalid standee combat changes.');
 end if;
 if (select count(*) from jsonb_each(changes))>500 or exists(
  select 1 from jsonb_each(changes) x where length(x.key) not between 1 and 120 or jsonb_typeof(x.value) is distinct from 'object'
 ) then return jsonb_build_object('error','Invalid standee combat changes.');end if;
 insert into battlemap_room.standee_combat(scene_id,standee_id,details)
 select scene_key,x.key,x.value from jsonb_each(changes) x
 on conflict(scene_id,standee_id) do update set details=excluded.details;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.battlemap_room_standee_combat(uuid,text,jsonb) from public;
grant execute on function public.battlemap_room_standee_combat(uuid,text,jsonb) to anon, authenticated;
