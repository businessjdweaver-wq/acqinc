begin;
create table if not exists rq_v2.task_ticket_claims (
 user_id uuid not null references auth.users(id),
 task_id text not null,
 milestone text not null check (milestone in ('half','complete')),
 earned_at timestamptz not null default now(),
 primary key (user_id,task_id,milestone)
);
alter table rq_v2.task_ticket_claims enable row level security;
revoke all on rq_v2.task_ticket_claims from anon,authenticated;
grant select on rq_v2.task_ticket_claims to authenticated;
drop policy if exists task_ticket_owner on rq_v2.task_ticket_claims;
create policy task_ticket_owner on rq_v2.task_ticket_claims for select to authenticated using (user_id=auth.uid());
create or replace function rq_v2.claim_task_ticket(p_task_id text,p_milestone text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_balance bigint;
begin
 if v_uid is null or p_task_id is null or length(p_task_id) not between 1 and 200 or p_milestone not in ('half','complete') then raise exception 'Invalid claim';end if;
 select balance into v_balance from rq_v2.economy_accounts where user_id=v_uid and currency='encounter_tickets' for update;
 if not found then raise exception 'Ticket account unavailable';end if;
 insert into rq_v2.task_ticket_claims(user_id,task_id,milestone) values(v_uid,p_task_id,p_milestone) on conflict do nothing;
 if not found then return false;end if;
 insert into rq_v2.economy_events(user_id,event_key,currency,amount) values(v_uid,'task-ticket:'||p_task_id||':'||p_milestone,'encounter_tickets',1);
 update rq_v2.economy_accounts set balance=balance+1 where user_id=v_uid and currency='encounter_tickets';
 return true;
end $$;
revoke all on function rq_v2.claim_task_ticket(text,text) from public,anon;
grant execute on function rq_v2.claim_task_ticket(text,text) to authenticated;
commit;
