CREATE OR REPLACE FUNCTION public.battlemap_room_publish(ticket uuid, operation text, payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare role_name text:=battlemap_room.viewer(ticket); st battlemap_room.state%rowtype; bucket text; c jsonb; next_scene jsonb; items jsonb; actor battlemap_room.players%rowtype; sender text; scene_id text; result jsonb; chat_event battlemap_room.events%rowtype; chat_id bigint; moderation text;
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
 elsif operation='chat_moderate' and role_name='gm' then
  moderation:=payload->>'action';
  if coalesce(payload->>'id','') !~ '^[0-9]{1,18}$' or moderation is null or moderation not in ('hide','show','delete') then
   return jsonb_build_object('error','Choose a valid chat item.');
  end if;
  chat_id:=(payload->>'id')::bigint;
  select * into chat_event from battlemap_room.events where id=chat_id and kind='chat' and test_id is not distinct from st.test_id for update;
  if not found then return jsonb_build_object('error','That chat item is no longer available.');end if;
  if moderation='delete' then
   delete from battlemap_room.events where id=chat_id;
  else
   update battlemap_room.events set body=jsonb_set(body,'{hidden}',to_jsonb(moderation='hide')) where id=chat_id;
  end if;
  perform battlemap_room.emit('chat_moderation',jsonb_build_object('id',chat_id,'action',moderation)
   ||case when moderation='show' then jsonb_build_object('message',chat_event.body-'hidden') else '{}'::jsonb end,chat_event.gm_only);
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
 'onlinePlayers',online,'scene',case when (snapshot or reset) and st.scene is not null then case when role_name='gm' then st.scene else battlemap_room.player_scene_state(-1)->'scene' end else null end);
end $function$;
