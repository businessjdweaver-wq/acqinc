-- Map placement assignments to the character identity used by the login picker.
create or replace view battlemap_room.roll_profile_identities as
select c.standee_id,
 'character:' || encode(sha256(convert_to(jsonb_build_array(
  min(c.profile), min(lower(btrim(regexp_replace(c.character_name, '[[:space:]]+', ' ', 'g'))))
 )::text, 'UTF8')), 'hex') as profile_id
from battlemap_room.controllers c
group by c.standee_id
having count(*) = 1;

-- Keep original rows. If old copies have multiple profiles, preserve their
-- independent records until the GM can choose which one to carry forward.
insert into battlemap_room.player_roll_profiles(standee_id, source, revision)
select i.profile_id, (jsonb_agg(p.source)->0), max(p.revision)
from battlemap_room.roll_profile_identities i
join battlemap_room.player_roll_profiles p using (standee_id)
group by i.profile_id
having count(*) = 1
on conflict (standee_id) do nothing;

create or replace function public.battlemap_room_player_roll_profile(
 ticket uuid, scene_key text, standee_key text, profile_source jsonb default null, expected_revision integer default null
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
 viewer_role text;
 scene_data jsonb;
 saved battlemap_room.player_roll_profiles%rowtype;
 identity_id text;
 storage_id text := standee_key;
begin
 perform 1 from battlemap_room.scene_lifecycle where singleton for share;
 viewer_role := battlemap_room.scene_viewer(ticket,scene_key);
 select scene into scene_data from battlemap_room.encounters where scene_id=scene_key for share;
 if viewer_role is null or scene_key is null or scene_data is null
  or standee_key is null or length(standee_key) not between 1 and 120
  or standee_key like 'character:%'
  or not exists (
   select 1 from jsonb_array_elements(scene_data->'tokens') t
   where t->>'roomId'=standee_key and coalesce(t->>'baseRole',t->>'role',case when t->>'name'='Adventurer' and t->>'icon'='⚔' and coalesce(t->>'src','')='' then 'pc' end)='pc'
    and t->>'incognito' is distinct from 'true'
  ) or (viewer_role='player' and not exists (
   select 1 from battlemap_room.players p join battlemap_room.controllers c on c.profile=p.profile
   where p.token=ticket and c.standee_id=standee_key
  )) then
  return jsonb_build_object('error','This character profile is unavailable in the active scene.');
 end if;

 select i.profile_id into identity_id
 from battlemap_room.roll_profile_identities i where i.standee_id=standee_key;
 if identity_id is not null and (
    exists(select 1 from battlemap_room.player_roll_profiles p where p.standee_id=identity_id)
    or (select count(*) from battlemap_room.roll_profile_identities i
        join battlemap_room.player_roll_profiles p using (standee_id)
        where i.profile_id=identity_id) <= 1
 ) then
  storage_id := identity_id;
 end if;

 select * into saved from battlemap_room.player_roll_profiles p where p.standee_id=storage_id;
 if saved.standee_id is null and storage_id<>standee_key then
  select p.* into saved from battlemap_room.roll_profile_identities i
  join battlemap_room.player_roll_profiles p using (standee_id)
  where i.profile_id=storage_id;
 end if;
 if profile_source is null then
  return jsonb_build_object('source',saved.source,'revision',coalesce(saved.revision,0));
 end if;
 if jsonb_typeof(profile_source) is distinct from 'object' or octet_length(profile_source::text)>120000
    or expected_revision is null or expected_revision<0 then
  return jsonb_build_object('error','Invalid roll profile.');
 end if;
 if expected_revision is distinct from coalesce(saved.revision,0) then
  return jsonb_build_object('error','This profile changed. Copy any unsaved edits, then reopen the launcher to load the latest version.');
 end if;

 if saved.standee_id=storage_id then
  update battlemap_room.player_roll_profiles
   set source=profile_source, revision=revision+1
   where standee_id=storage_id and revision=expected_revision returning * into saved;
 else
  insert into battlemap_room.player_roll_profiles(standee_id,source,revision)
   values(storage_id,profile_source,expected_revision+1) on conflict do nothing returning * into saved;
 end if;
 if profile_source is not null and saved.standee_id is null then
  return jsonb_build_object('error','This profile changed. Copy any unsaved edits, then reopen the launcher to load the latest version.');
 end if;
 return jsonb_build_object('source',saved.source,'revision',coalesce(saved.revision,0));
end;
$$;
