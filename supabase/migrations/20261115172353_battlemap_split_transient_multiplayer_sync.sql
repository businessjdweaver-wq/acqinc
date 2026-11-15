
create table battlemap_room.transient_pings(
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 test_id uuid, scene_id text, body jsonb not null
);
alter table battlemap_room.transient_pings enable row level security;
create index transient_pings_created_at on battlemap_room.transient_pings(created_at);

create function public.battlemap_room_ping(ticket uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare role_name text; sender text; scope_test uuid; scope_scene text;
begin
 select battlemap_room.viewer(ticket),test_id,active_scene_id into role_name,scope_test,scope_scene
 from battlemap_room.state where id and scene is not null;
 if not found then return jsonb_build_object('error','Activate a scene first.');end if;
 if role_name is null then return jsonb_build_object('error','This scene is unavailable.');end if;
 if jsonb_typeof(payload->'x') is distinct from 'number' or jsonb_typeof(payload->'y') is distinct from 'number' or jsonb_typeof(payload->'z') is distinct from 'number'
    or (payload->>'x')::numeric not between 0 and 500 or (payload->>'y')::numeric not between 0 and 500 or (payload->>'z')::numeric not between 0 and 30
    or pg_column_size(payload)>1000 then return jsonb_build_object('error','Invalid ping.');end if;
 if role_name='gm' then sender:='GM';else
  select coalesce(nullif(display_name,''),profile) into sender from battlemap_room.players where token=ticket;
 end if;
 -- Scope has no coordinates in the public wakeup. Clients fetch coordinates through authenticated sync.
 insert into battlemap_room.transient_pings(test_id,scene_id,body) values(scope_test,scope_scene,
  jsonb_build_object('x',payload->'x','y',payload->'y','z',payload->'z','normal',payload->'normal','name',sender,
   'recenter',role_name='gm' and coalesce(payload->'recenter'='true'::jsonb,false)));
 if pg_try_advisory_xact_lock(75731542) then
  delete from battlemap_room.transient_pings where created_at<clock_timestamp()-interval '10 seconds';
 end if;
 begin
  perform realtime.send('{}'::jsonb,'ping','battlemap-ping-wakeup',false);
 exception when others then
  -- A slow or unavailable Realtime service must not reject the ping.
  null;
 end;
 return jsonb_build_object('ok',true);
end;
$$;

create function public.battlemap_room_presence(ticket uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
 update battlemap_room.players a set updated=now()
 where a.token=ticket and a.updated<now()-interval '15 seconds'
 and exists(select 1 from battlemap_room.profiles p where p.name=a.profile and p.approved);
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.battlemap_room_ping(uuid,jsonb),public.battlemap_room_presence(uuid) from public;
grant execute on function public.battlemap_room_ping(uuid,jsonb),public.battlemap_room_presence(uuid) to anon,authenticated;
CREATE OR REPLACE FUNCTION public.battlemap_room_sync(ticket uuid, since_event bigint DEFAULT '-1'::integer, snapshot boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare role_name text; st battlemap_room.state%rowtype; latest bigint; oldest bigint; entries jsonb; reset boolean; online jsonb; blocked boolean;
begin
 select * into st from battlemap_room.state where id;
 role_name:=battlemap_room.viewer(ticket);
 if role_name is null and not exists(select 1 from battlemap_room.players a join battlemap_room.profiles p on p.name=a.profile and p.approved where a.token=ticket) then
  return jsonb_build_object('error','Choose your profile again.');
 end if;
 blocked:=role_name is null;
 if role_name='gm' then
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
  from (select * from battlemap_room.events where kind='chat' and test_id is not distinct from st.test_id and (not gm_only or role_name='gm') and (role_name='gm' or kind<>'chat' or body->'hidden' is distinct from 'true'::jsonb) order by id desc limit 50) q;
 else
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',case when kind='delta' and role_name<>'gm' then
   body||jsonb_build_object('changes',coalesce((select jsonb_agg(c||jsonb_build_object('item',case when c->'item'='null' then null else battlemap_room.player_token(c->'item') end)) from jsonb_array_elements(body->'changes') c where c->>'bucket'='tokens'),'[]')||
   coalesce((select jsonb_agg(c) from jsonb_array_elements(body->'changes') c where c->>'bucket'<>'tokens'),'[]'))
   else body end,'at',created_at) order by id),'[]') into entries
  from battlemap_room.events where id>since_event and id<=latest and test_id is not distinct from st.test_id and (not gm_only or role_name='gm') and (role_name='gm' or kind<>'chat' or body->'hidden' is distinct from 'true'::jsonb) and (kind<>'ping' or created_at>now()-interval '7 seconds')
   and (kind<>'chat_moderation' or body->>'action'<>'show' or exists(
    select 1 from battlemap_room.events original
    where original.kind='chat' and original.id::text=battlemap_room.events.body->>'id'
     and original.test_id is not distinct from st.test_id
     and (role_name='gm' or original.body->'hidden' is distinct from 'true'::jsonb)
   ));
 end if;
 return jsonb_build_object('cursor',latest,'reset',reset,'events',entries,'revision',st.revision,'active',st.scene is not null,'title',st.title,'testing',st.test_id is not null,'sceneId',st.active_scene_id,
 'paused',st.paused,'gmOnline',coalesce(st.heartbeat>now()-interval '65 seconds',false),
 'initiative',case when role_name='gm' then st.initiative else battlemap_room.public_initiative(st.initiative,st.scene) end,
 'onlinePlayers',online,'pings',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind','ping','body',p.body,'at',p.created_at) order by p.created_at) from (select * from battlemap_room.transient_pings where created_at>now()-interval '7 seconds' and test_id is not distinct from st.test_id and scene_id is not distinct from st.active_scene_id order by created_at desc limit 40) p),'[]'::jsonb),'scene',case when (snapshot or reset) and st.scene is not null then case when role_name='gm' then st.scene else battlemap_room.player_scene_state(-1)->'scene' end else null end);
end $function$;
CREATE OR REPLACE FUNCTION battlemap_room.scene_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare changes jsonb; bucket text; chunk jsonb;
begin
 if new.revision<>old.revision then
  if current_setting('battlemap.activating',true)='yes' or old.scene is null or new.scene is not distinct from old.scene
    or exists(select 1 from jsonb_array_elements(coalesce(old.scene->'pieces','[]')||coalesce(old.scene->'tokens','[]')||coalesce(old.scene->'areas','[]')) j where not j ? 'roomId')
    or exists(select 1 from jsonb_array_elements(coalesce(new.scene->'pieces','[]')||coalesce(new.scene->'tokens','[]')||coalesce(new.scene->'areas','[]')) j where not j ? 'roomId') then
   perform battlemap_room.emit('reset',jsonb_build_object('revision',new.revision));
  else
   changes:='[]'::jsonb;
   foreach bucket in array array['pieces','tokens','areas'] loop
    if new.scene->bucket is not distinct from old.scene->bucket then continue;end if;
    select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'id',coalesce(a.id,b.id),'item',b.item)),'[]'::jsonb) into chunk
    from (select j->>'roomId' id,j item from jsonb_array_elements(coalesce(old.scene->bucket,'[]')) j) a
    full join (select j->>'roomId' id,j item from jsonb_array_elements(coalesce(new.scene->bucket,'[]')) j) b using(id)
    where a.item is distinct from b.item;
    changes:=changes||chunk;
   end loop;
   perform battlemap_room.emit('delta',jsonb_build_object('revision',new.revision,'changes',changes));
  end if;
 end if;
 if new.paused is distinct from old.paused or new.gm_token is distinct from old.gm_token then
  perform battlemap_room.emit('status','{}'::jsonb);
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.battlemap_room_gm_login_named(gm_name text, password text, takeover text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.state%rowtype; next_ticket uuid:=gen_random_uuid();
begin
 if not pg_try_advisory_xact_lock(hashtextextended('battlemap-gm:'||coalesce(lower(gm_name),''),0)) then
  return jsonb_build_object('error','Wait a moment before retrying.');
 end if;
 select last_attempt into st.last_attempt from battlemap_room.state where id;
 if takeover is null and st.last_attempt>clock_timestamp()-interval '1 second' then return jsonb_build_object('error','Wait a moment before retrying.');end if;
 if password is null or length(password)>100 or not coalesce((select extensions.crypt(password,a.verifier)=a.verifier from battlemap_room.gm_accounts a where a.name=lower(gm_name)),false) then
  update battlemap_room.state set last_attempt=clock_timestamp() where id;
  return jsonb_build_object('error','Incorrect GM password.');
 end if;
 select * into st from battlemap_room.state where id for update;
 if takeover is null and st.last_attempt>clock_timestamp()-interval '1 second' then return jsonb_build_object('error','Wait a moment before retrying.'); end if;
 if takeover is not null and takeover is distinct from md5(st.gm_token::text) then return jsonb_build_object('error','The GM session changed. Sign in again.'); end if;
 update battlemap_room.state set last_attempt=clock_timestamp() where id;
 if takeover is null and st.heartbeat>now()-interval '65 seconds' then return jsonb_build_object('takeover',md5(st.gm_token::text)); end if;
 update battlemap_room.state set gm_token=next_ticket,heartbeat=now() where id;
 return jsonb_build_object('token',next_ticket,'gm',true);
end $function$;
