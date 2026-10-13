-- Relentless Quest V2 Integration I1. Run in Supabase SQL Editor.
-- Existing rq_v2 snapshot tables and private storage bucket are untouched.
create schema if not exists rq_v2;
create table if not exists rq_v2.task_manager_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists rq_v2.combat_tickets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  completion_id uuid not null,
  state text not null default 'available' check (state in ('available','redeemed','revoked')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  unique (user_id, completion_id)
);
create index if not exists combat_tickets_user_state_idx on rq_v2.combat_tickets(user_id,state,created_at);
alter table rq_v2.task_manager_state enable row level security;
alter table rq_v2.combat_tickets enable row level security;
revoke all on rq_v2.task_manager_state, rq_v2.combat_tickets from public, anon;
grant usage on schema rq_v2 to authenticated;
grant select,insert,update,delete on rq_v2.task_manager_state to authenticated;
grant select,insert,update on rq_v2.combat_tickets to authenticated;
drop policy if exists task_state_owner on rq_v2.task_manager_state;
create policy task_state_owner on rq_v2.task_manager_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists tickets_owner_select on rq_v2.combat_tickets;
create policy tickets_owner_select on rq_v2.combat_tickets for select to authenticated using (user_id = auth.uid());
drop policy if exists tickets_owner_insert on rq_v2.combat_tickets;
create policy tickets_owner_insert on rq_v2.combat_tickets for insert to authenticated with check (user_id = auth.uid() and state='available' and redeemed_at is null);
-- Ticket redemption is a server-side RPC, not a browser-controlled update.
create or replace function rq_v2.redeem_combat_ticket(p_ticket_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update rq_v2.combat_tickets set state='redeemed', redeemed_at=now()
  where id=p_ticket_id and user_id=auth.uid() and state='available';
  get diagnostics n = row_count;
  return n=1;
end $$;
revoke all on function rq_v2.redeem_combat_ticket(uuid) from public,anon;
grant execute on function rq_v2.redeem_combat_ticket(uuid) to authenticated;
notify pgrst, 'reload schema';
