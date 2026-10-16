-- E2: Run in Supabase SQL Editor after the 5007-gold opening migration.
-- Authenticated, idempotent post-migration focus earnings; 10 gold/minute.
begin;
create table if not exists rq_v2.focus_gold_sessions (
 user_id uuid not null references auth.users(id),
 session_id uuid not null,
 started_at timestamptz not null,
 ended_at timestamptz not null,
 elapsed_ms bigint not null,
 awarded_gold bigint not null,
 primary key(user_id,session_id)
);
alter table rq_v2.focus_gold_sessions enable row level security;
revoke all on rq_v2.focus_gold_sessions from anon,authenticated;
grant select on rq_v2.focus_gold_sessions to authenticated;
drop policy if exists focus_gold_read on rq_v2.focus_gold_sessions;
create policy focus_gold_read on rq_v2.focus_gold_sessions for select to authenticated using(user_id=auth.uid());
create or replace function rq_v2.claim_focus_gold(p_session_id uuid,p_started_at timestamptz,p_ended_at timestamptz,p_elapsed_ms bigint)
returns table(awarded_gold bigint,new_balance bigint,was_new boolean)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_old rq_v2.focus_gold_sessions%rowtype;v_gold bigint;
begin
 if v_uid is null then raise exception 'Sign in required';end if;
 if p_session_id is null or p_started_at is null or p_ended_at is null or p_elapsed_ms is null then raise exception 'Missing session evidence';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text||p_session_id::text,0));
 select * into v_old from rq_v2.focus_gold_sessions where user_id=v_uid and session_id=p_session_id;
 if found then
  if v_old.started_at<>p_started_at or v_old.ended_at<>p_ended_at or v_old.elapsed_ms<>p_elapsed_ms then raise exception 'Conflicting session identifier';end if;
  select balance into new_balance from rq_v2.economy_accounts where user_id=v_uid and currency='gold';
  awarded_gold:=v_old.awarded_gold;was_new:=false;return next;return;
 end if;
 if p_started_at < '2026-10-15 01:49:37+00'::timestamptz then raise exception 'Historical session already migrated';end if;
 if p_ended_at<=p_started_at or p_ended_at>now()+interval '2 minutes' or p_started_at<now()-interval '14 days' then raise exception 'Invalid session timestamps';end if;
 if p_elapsed_ms<6000 or p_elapsed_ms>14400000 then raise exception 'Invalid session duration';end if;
 if pg_catalog.abs((extract(epoch from p_ended_at-p_started_at)*1000)::bigint-p_elapsed_ms)>10000 then raise exception 'Duration does not match timestamps';end if;
 v_gold:=pg_catalog.floor(p_elapsed_ms::numeric/6000)::bigint;
 if v_gold<1 then raise exception 'Session too short';end if;
 if not exists(select 1 from rq_v2.economy_events where user_id=v_uid and event_key='migration:2026-10-15:legacy-focus-to-gold:approved-4987') then raise exception 'Opening migration required';end if;
 insert into rq_v2.focus_gold_sessions values(v_uid,p_session_id,p_started_at,p_ended_at,p_elapsed_ms,v_gold);
 insert into rq_v2.economy_events(user_id,event_key,currency,amount) values(v_uid,'focus:e2:'||p_session_id::text,'gold',v_gold);
 update rq_v2.economy_accounts set balance=balance+v_gold where user_id=v_uid and currency='gold' returning balance into new_balance;
 awarded_gold:=v_gold;was_new:=true;return next;
end $$;
revoke all on function rq_v2.claim_focus_gold(uuid,timestamptz,timestamptz,bigint) from public,anon;
grant execute on function rq_v2.claim_focus_gold(uuid,timestamptz,timestamptz,bigint) to authenticated;
commit;
