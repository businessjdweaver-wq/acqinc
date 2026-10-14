-- E1 daily rewards v2: participation, improvement, return, and consistency.
-- Run after e1-daily-log.sql. Existing awards are never replayed.
create or replace function rq_v2.claim_daily_rewards(p_local_date date,p_choice text default 'gold')
returns table(reward_currency text,reward_amount integer,was_new boolean)
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=auth.uid();
 v_log rq_v2.daily_logs%rowtype;
 v_prior numeric; v_current numeric; v_count integer; v_total integer;
 v_previous date; v_recent integer; v_gold integer:=20;
 v_currency text; v_amount integer; v_rows integer;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_choice is null or p_choice not in ('gold','focus_points') then raise exception 'Choose gold or focus_points'; end if;
 if p_local_date <> (now() at time zone 'America/Indiana/Indianapolis')::date then
  raise exception 'Daily rewards may only be claimed for today';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text||':'||p_local_date::text,0));
 select * into v_log from rq_v2.daily_logs where user_id=v_uid and local_date=p_local_date;
 if not found then raise exception 'Submit a daily log first'; end if;
 select count(*),count(*) filter(where value='true'::jsonb) into v_total,v_count from pg_catalog.jsonb_each(v_log.activities);
 v_current:=case when v_total>0 then v_count::numeric/v_total else 0 end;
 select avg((select count(*) filter(where value='true'::jsonb)::numeric/nullif(count(*),0)
             from pg_catalog.jsonb_each(p.activities)))
 into v_prior from (
  select activities from rq_v2.daily_logs where user_id=v_uid and local_date<p_local_date
  order by local_date desc limit 7
 ) p;
 if v_prior is not null and v_current>v_prior then
   v_gold:=v_gold+least(10,greatest(1,pg_catalog.ceil((v_current-v_prior)*10)::integer));
 end if;
 select max(local_date) into v_previous from rq_v2.daily_logs where user_id=v_uid and local_date<p_local_date;
 if v_previous is not null and v_previous<p_local_date-1 then v_gold:=v_gold+5; end if;
 select count(*) into v_recent from rq_v2.daily_logs
 where user_id=v_uid and local_date between p_local_date-9 and p_local_date;
 if v_recent>=7 then v_gold:=v_gold+10; end if;
 v_gold:=least(45,v_gold);
 for v_currency,v_amount in
  select 'encounter_tickets'::text,1
  union all
  select p_choice,case when p_choice='focus_points' then pg_catalog.ceil(v_gold::numeric/10)::integer else v_gold end
 loop
  insert into rq_v2.daily_reward_claims(user_id,local_date,reward_type,currency,amount)
  values(v_uid,p_local_date,case when v_currency='encounter_tickets' then 'ticket' else 'improvement' end,v_currency,v_amount)
  on conflict do nothing;
  get diagnostics v_rows=row_count;
  if v_rows=1 then
   insert into rq_v2.economy_events(user_id,event_key,currency,amount)
   values(v_uid,'daily:'||p_local_date::text||':'||case when v_currency='encounter_tickets' then 'ticket' else 'improvement' end,v_currency,v_amount);
   insert into rq_v2.economy_accounts(user_id,currency,balance)
   values(v_uid,v_currency,v_amount)
   on conflict(user_id,currency) do update set balance=rq_v2.economy_accounts.balance+excluded.balance;
  end if;
  reward_currency:=v_currency;reward_amount:=v_amount;was_new:=(v_rows=1);
  return next;
 end loop;
end $$;
revoke all on function rq_v2.claim_daily_rewards(date,text) from public,anon;
grant execute on function rq_v2.claim_daily_rewards(date,text) to authenticated;
