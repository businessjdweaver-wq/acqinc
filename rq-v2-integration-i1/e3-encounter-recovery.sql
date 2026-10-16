-- E3 recovery: durable paid encounter status and resumable admission.
-- Install after e3-gold-encounter-admission.sql.
begin;
create table if not exists rq_v2.gold_encounters(
 user_id uuid not null references auth.users(id),
 encounter_id uuid not null,
 status text not null default 'active' check(status in ('active','completed')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 primary key(user_id,encounter_id)
);
alter table rq_v2.gold_encounters enable row level security;
revoke all on rq_v2.gold_encounters from anon,authenticated;
grant select on rq_v2.gold_encounters to authenticated;
drop policy if exists gold_encounters_owner on rq_v2.gold_encounters;
create policy gold_encounters_owner on rq_v2.gold_encounters for select to authenticated using(user_id=auth.uid());
create or replace function rq_v2.open_gold_encounter(p_encounter_id uuid)
returns table(encounter_id uuid,charged boolean,balance bigint)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_gold bigint;v_active uuid;
begin
 if v_uid is null or p_encounter_id is null then raise exception 'Authentication and encounter ID required';end if;
 select a.balance into v_gold from rq_v2.economy_accounts a where a.user_id=v_uid and a.currency='gold' for update;
 if not found then raise exception 'Gold account missing';end if;
 select e.encounter_id into v_active from rq_v2.gold_encounters e where e.user_id=v_uid and e.status='active' order by e.created_at limit 1;
 if v_active is not null and v_active<>p_encounter_id then
  encounter_id:=v_active;charged:=false;balance:=v_gold;return next;return;
 end if;
 if v_active=p_encounter_id then encounter_id:=v_active;charged:=false;balance:=v_gold;return next;return;end if;
 if exists(select 1 from rq_v2.gold_encounters e where e.user_id=v_uid and e.encounter_id=p_encounter_id) then raise exception 'Completed encounter cannot be reopened';end if;
 if v_gold<100 then raise exception 'Insufficient gold for encounter';end if;
 insert into rq_v2.economy_events(user_id,event_key,currency,amount) values(v_uid,'encounter:e3:'||p_encounter_id::text,'gold',-100);
 update rq_v2.economy_accounts a set balance=a.balance-100 where a.user_id=v_uid and a.currency='gold' returning a.balance into v_gold;
 insert into rq_v2.gold_encounters(user_id,encounter_id) values(v_uid,p_encounter_id);
 encounter_id:=p_encounter_id;charged:=true;balance:=v_gold;return next;
end $$;
create or replace function rq_v2.complete_gold_encounter(p_encounter_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in required';end if;
 update rq_v2.gold_encounters set status='completed',completed_at=now()
 where user_id=v_uid and encounter_id=p_encounter_id and status='active';
 if found then return true;end if;
 if exists(select 1 from rq_v2.gold_encounters where user_id=v_uid and encounter_id=p_encounter_id and status='completed') then return false;end if;
 raise exception 'Encounter not found';
end $$;
revoke all on function rq_v2.open_gold_encounter(uuid) from public,anon;
revoke all on function rq_v2.complete_gold_encounter(uuid) from public,anon;
grant execute on function rq_v2.open_gold_encounter(uuid) to authenticated;
grant execute on function rq_v2.complete_gold_encounter(uuid) to authenticated;
commit;
