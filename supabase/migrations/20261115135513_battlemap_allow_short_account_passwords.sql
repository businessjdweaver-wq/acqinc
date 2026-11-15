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
   if octet_length(assignments->>'password') not between 1 and 72 then return jsonb_build_object('error','Enter a short password or use Remove password.');end if;
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
