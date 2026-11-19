create table battlemap_room.spell_catalog (
 singleton boolean primary key default true check (singleton),
 owner_id uuid not null references auth.users(id) on delete cascade
);

alter table battlemap_room.spell_catalog enable row level security;

create function public.battlemap_room_spell_catalog(
 ticket uuid, scene_key text, page_offset integer default 0, operation text default 'read'
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
 viewer text := battlemap_room.scene_viewer(ticket, scene_key);
 owner_id uuid;
begin
 if viewer is null or scene_key is null or not exists (
  select 1 from battlemap_room.encounters where scene_id=scene_key
 ) then
  return jsonb_build_object('error','The spell catalog is unavailable.');
 end if;

 if operation='share' then
  if viewer<>'gm' or auth.uid() is null or not exists (
   select 1 from public.rq_spells s where s.user_id=auth.uid()
  ) then
   return jsonb_build_object('error','Sign in to Spell Workshop with a catalog owner account and reopen Battlemap.');
  end if;
  insert into battlemap_room.spell_catalog(singleton,owner_id) values(true,auth.uid())
  on conflict(singleton) do update set owner_id=excluded.owner_id;
  return jsonb_build_object('shared',true);
 elsif operation='unshare' and viewer='gm' then
  delete from battlemap_room.spell_catalog where singleton;
  return jsonb_build_object('shared',false);
 elsif operation is distinct from 'read' or page_offset is null or page_offset<0 then
  return jsonb_build_object('error','The spell catalog is unavailable.');
 end if;

 select c.owner_id into owner_id from battlemap_room.spell_catalog c where c.singleton;
 return jsonb_build_object('shared',owner_id is not null,'spells',coalesce((
  select jsonb_agg(to_jsonb(page) order by page.level,page.name,page.id)
  from (
   select s.id,s.name,s.level,s.school,s.casting_time,s.range,s.target,s.components,s.duration,
    s.concentration,s.ritual,s.description,s.higher_levels,s.damage,s.damage_type,s.extra,s.extra_type,
    s.save_ability,s.attack_type,s.scaling,s.classes
   from public.rq_spells s where s.user_id=owner_id
   order by s.level,s.name,s.id limit 250 offset page_offset
  ) page
 ),'[]'::jsonb));
end;
$$;

revoke all on function public.battlemap_room_spell_catalog(uuid,text,integer,text) from public;
grant execute on function public.battlemap_room_spell_catalog(uuid,text,integer,text) to anon, authenticated;

-- Older clients can replace the combat JSON without knowing about spellbooks.
create function battlemap_room.keep_roll_profile_spellbook()
returns trigger language plpgsql set search_path to '' as $$
begin
 if old.source ? 'spellbook' and not (new.source ? 'spellbook') then
  new.source := new.source || jsonb_build_object('spellbook',old.source->'spellbook');
 end if;
 return new;
end;
$$;

create trigger keep_roll_profile_spellbook before update of source on battlemap_room.player_roll_profiles
for each row execute function battlemap_room.keep_roll_profile_spellbook();
