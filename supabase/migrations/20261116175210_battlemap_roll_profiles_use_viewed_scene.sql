create or replace function public.battlemap_room_player_roll_profile(
 ticket uuid, scene_key text, standee_key text, profile_source jsonb default null, expected_revision integer default null
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
 viewer_role text;
 scene_data jsonb;
 saved battlemap_room.player_roll_profiles%rowtype;
begin
 perform 1 from battlemap_room.scene_lifecycle where singleton for share;
 viewer_role := battlemap_room.scene_viewer(ticket,scene_key);
 select scene into scene_data from battlemap_room.encounters where scene_id=scene_key for share;
 if viewer_role is null or scene_key is null or scene_data is null
  or standee_key is null or length(standee_key) not between 1 and 120
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

 if profile_source is null then
  select * into saved from battlemap_room.player_roll_profiles where standee_id=standee_key;
 elsif jsonb_typeof(profile_source) is distinct from 'object' or octet_length(profile_source::text)>120000
    or expected_revision is null or expected_revision<0 then
  return jsonb_build_object('error','Invalid roll profile.');
 elsif expected_revision=0 then
  insert into battlemap_room.player_roll_profiles(standee_id,source)
   values(standee_key,profile_source) on conflict do nothing returning * into saved;
 else
  update battlemap_room.player_roll_profiles
   set source=profile_source, revision=revision+1
   where standee_id=standee_key and revision=expected_revision returning * into saved;
 end if;
 if profile_source is not null and saved.standee_id is null then
  return jsonb_build_object('error','This profile changed. Copy any unsaved edits, then reopen the launcher to load the latest version.');
 end if;
 return jsonb_build_object('source',saved.source,'revision',coalesce(saved.revision,0));
end;
$$;
