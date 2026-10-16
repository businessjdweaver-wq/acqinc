-- Daily check-in: one entry per local date, editable checklist configuration.
create table if not exists rq_v2.daily_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 activities jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists rq_v2.daily_logs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 local_date date not null,
 activities jsonb not null,
 mood text not null,
 note text not null default '',
 submitted_at timestamptz not null default now(),
 unique(user_id,local_date)
);
alter table rq_v2.daily_preferences enable row level security;
alter table rq_v2.daily_logs enable row level security;
grant select,insert,update on rq_v2.daily_preferences,rq_v2.daily_logs to authenticated;
drop policy if exists daily_preferences_owner on rq_v2.daily_preferences;
create policy daily_preferences_owner on rq_v2.daily_preferences for all to authenticated using (user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists daily_logs_owner on rq_v2.daily_logs;
create policy daily_logs_owner on rq_v2.daily_logs for all to authenticated using (user_id=auth.uid()) with check(user_id=auth.uid());
-- Do not grant delete: submissions remain in the daily history.

-- Reward claims are unique per day and type. The browser cannot write these directly.
create table if not exists rq_v2.daily_reward_claims (
 user_id uuid not null references auth.users(id) on delete cascade,
 local_date date not null,
 reward_type text not null check (reward_type in ('ticket','improvement')),
 currency text not null check (currency in ('encounter_tickets','gold','focus_points')),
 amount integer not null check (amount > 0),
 claimed_at timestamptz not null default now(),
 primary key(user_id,local_date,reward_type)
);
alter table rq_v2.daily_reward_claims enable row level security;
grant select on rq_v2.daily_reward_claims to authenticated;
revoke insert,update,delete on rq_v2.daily_reward_claims from authenticated,anon;
drop policy if exists daily_reward_claims_owner on rq_v2.daily_reward_claims;
create policy daily_reward_claims_owner on rq_v2.daily_reward_claims for select to authenticated using(user_id=auth.uid());
-- SECURITY DEFINER checks a saved log, determines improvement from prior entries,
-- and atomically credits both the account and the immutable event ledger.
create or replace function rq_v2.claim_daily_rewards(p_local_date date,p_choice text default 'gold')
returns table(reward_currency text,reward_amount integer,was_new boolean)
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=auth.uid(); v_log rq_v2.daily_logs%rowtype;
 v_count int; v_total int; v_prior numeric; v_current numeric;
 v_bonus int:=0; v_currency text; v_rows int; v_amount int;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_choice not in ('gold','focus_points') then raise exception 'Choose gold or focus_points'; end if;
 if p_local_date <> (now() at time zone 'America/Indiana/Indianapolis')::date then
   raise exception 'Daily rewards can only be claimed for today';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_local_date::text,0));
 select * into v_log from rq_v2.daily_logs where user_id=v_uid and local_date=p_local_date;
 if not found then raise exception 'Submit your daily log first'; end if;
 select count(*),count(*) filter(where value='true'::jsonb) into v_total,v_count
 from jsonb_each(v_log.activities);
 v_current:=case when v_total>0 then v_count::numeric/v_total else 0 end;
 select avg(
  (select count(*) filter(where value='true'::jsonb)::numeric/nullif(count(*),0)
   from jsonb_each(p.activities))
 ) into v_prior from (
  select activities from rq_v2.daily_logs
  where user_id=v_uid and local_date<p_local_date
  order by local_date desc limit 7
 ) p;
 -- Improvement is relative to the last seven logged days; no negative rewards.
 if v_prior is not null and v_current>v_prior then
   v_bonus:=greatest(1,ceil((v_current-v_prior)*20)::int);
 end if;
 for v_currency,v_amount in
  select 'encounter_tickets'::text,1
  union all
  select p_choice,v_bonus where v_bonus>0
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
