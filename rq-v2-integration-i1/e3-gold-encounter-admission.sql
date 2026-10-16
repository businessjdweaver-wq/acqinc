-- E3: Install in Supabase SQL Editor. Spend 100 gold once per unique battle.
-- Existing tickets are left untouched for audit, but no longer required by the new launcher.
begin;
create or replace function rq_v2.start_gold_encounter(p_encounter_id uuid)
returns table(applied boolean,new_balance bigint)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_balance bigint;v_key text;
begin
 if v_uid is null then raise exception 'Sign in required';end if;
 if p_encounter_id is null then raise exception 'Encounter identifier required';end if;
 v_key:='encounter:e3:'||p_encounter_id::text;
 -- Serialize all gold spending for this account.
 select balance into v_balance from rq_v2.economy_accounts
 where user_id=v_uid and currency='gold' for update;
 if not found then raise exception 'Gold account not initialized';end if;
 if exists(select 1 from rq_v2.economy_events where user_id=v_uid and event_key=v_key) then
  applied:=false;new_balance:=v_balance;return next;return;
 end if;
 if v_balance<100 then raise exception 'Insufficient gold: encounter costs 100';end if;
 insert into rq_v2.economy_events(user_id,event_key,currency,amount)
 values(v_uid,v_key,'gold',-100);
 update rq_v2.economy_accounts set balance=balance-100
 where user_id=v_uid and currency='gold' returning balance into new_balance;
 applied:=true;return next;
end $$;
revoke all on function rq_v2.start_gold_encounter(uuid) from public,anon;
grant execute on function rq_v2.start_gold_encounter(uuid) to authenticated;
commit;
