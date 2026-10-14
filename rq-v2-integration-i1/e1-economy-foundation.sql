-- Relentless Quest V2 E1: durable reward events and currency accounts.
-- Run in Supabase SQL editor once. Does not modify existing task/gold tables.
create schema if not exists rq_v2;
create table if not exists rq_v2.economy_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  currency text not null check (currency in ('gold','focus_points','roster_tokens','encounter_tickets')),
  amount bigint not null check (amount <> 0),
  created_at timestamptz not null default now(),
  unique (user_id,event_key)
);
create table if not exists rq_v2.economy_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency in ('gold','focus_points','roster_tokens','encounter_tickets')),
  balance bigint not null default 0 check (balance >= 0),
  primary key (user_id,currency)
);
alter table rq_v2.economy_events enable row level security;
alter table rq_v2.economy_accounts enable row level security;
revoke all on rq_v2.economy_events from anon, authenticated;
revoke all on rq_v2.economy_accounts from anon, authenticated;
grant select on rq_v2.economy_events, rq_v2.economy_accounts to authenticated;
drop policy if exists economy_events_owner_read on rq_v2.economy_events;
create policy economy_events_owner_read on rq_v2.economy_events for select to authenticated using (user_id=auth.uid());
drop policy if exists economy_accounts_owner_read on rq_v2.economy_accounts;
create policy economy_accounts_owner_read on rq_v2.economy_accounts for select to authenticated using (user_id=auth.uid());
-- Only this SECURITY DEFINER RPC may mutate currency.
create or replace function rq_v2.apply_economy_event(p_event_key text,p_currency text,p_amount bigint)
returns table(applied boolean,new_balance bigint)
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_balance bigint; v_inserted integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_event_key is null or length(p_event_key) < 3 or length(p_event_key)>200 then raise exception 'Invalid event key'; end if;
  if p_currency not in ('gold','focus_points','roster_tokens','encounter_tickets') then raise exception 'Invalid currency'; end if;
  if p_amount is null or p_amount=0 then raise exception 'Invalid amount'; end if;
  -- E1 deliberately disallows client-initiated positive awards.
  -- Later releases will use server-verified task evidence and trusted reward RPCs.
  raise exception 'E1 reward mutations are disabled until server-side task verification is installed';
end $$;
revoke all on function rq_v2.apply_economy_event(text,text,bigint) from public, anon, authenticated;
-- Read-only ledger is available now; grants for safe awarding come in a subsequent migration.
