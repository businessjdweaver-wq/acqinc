-- One-time 2026-10-13 daily participation adjustment, plus atomic ticket spending.
-- Existing claimed ticket is not modified.
create or replace function rq_v2.claim_daily_baseline_adjustment(p_local_date date)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_rows int;
begin
 if v_uid is null then raise exception 'Authentication required';end if;
 if p_local_date<>date '2026-10-13' then raise exception 'Only launch-day adjustment is permitted';end if;
 if not exists(select 1 from rq_v2.daily_reward_claims where user_id=v_uid and local_date=p_local_date and reward_type='ticket')
 then raise exception 'Original daily reward claim not found';end if;
 insert into rq_v2.economy_events(user_id,event_key,currency,amount)
 values(v_uid,'daily:2026-10-13:baseline-adjustment','gold',20) on conflict do nothing;
 get diagnostics v_rows=row_count;
 if v_rows=1 then
 insert into rq_v2.economy_accounts(user_id,currency,balance) values(v_uid,'gold',20)
 on conflict(user_id,currency) do update set balance=rq_v2.economy_accounts.balance+excluded.balance;
 end if;
 return v_rows*20;
end $$;
revoke all on function rq_v2.claim_daily_baseline_adjustment(date) from public,anon;
grant execute on function rq_v2.claim_daily_baseline_adjustment(date) to authenticated;
create or replace function rq_v2.spend_encounter_ticket(p_ticket_key text)
returns bigint language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_balance bigint;v_existing bigint;
begin
 if v_uid is null then raise exception 'Authentication required';end if;
 if p_ticket_key is null or p_ticket_key !~ '^battle:[a-zA-Z0-9_-]{12,90}$' then raise exception 'Invalid battle key';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text||':tickets',0));
 select amount into v_existing from rq_v2.economy_events where user_id=v_uid and event_key=p_ticket_key;
 if found then
  select balance into v_balance from rq_v2.economy_accounts where user_id=v_uid and currency='encounter_tickets';
  return coalesce(v_balance,0);
 end if;
 update rq_v2.economy_accounts set balance=balance-1 where user_id=v_uid and currency='encounter_tickets' and balance>=1 returning balance into v_balance;
 if not found then raise exception 'No server encounter tickets available';end if;
 insert into rq_v2.economy_events(user_id,event_key,currency,amount) values(v_uid,p_ticket_key,'encounter_tickets',-1);
 return v_balance;
end $$;
revoke all on function rq_v2.spend_encounter_ticket(text) from public,anon;
grant execute on function rq_v2.spend_encounter_ticket(text) to authenticated;
