-- Relentless Quest V2: approved one-time opening gold conversion (2026-10-15).
-- Run ONCE in Supabase SQL Editor (database owner/admin).
-- Approved: existing E1 gold 20 + 4,987 legacy work conversion = 5,007 gold.
-- Never deletes or rewrites history. Re-running is idempotent.
-- If the starting account or history differs, FAIL instead of silently adjusting.
begin;
do $migration$
declare
 v_uid uuid;
 v_count integer;
 v_balance bigint;
 v_existing rq_v2.economy_events%rowtype;
 v_key constant text := 'migration:2026-10-15:legacy-focus-to-gold:approved-4987';
begin
 select count(*) into v_count
 from rq_v2.economy_accounts where currency='gold';
 if v_count=1 then
   select user_id into v_uid from rq_v2.economy_accounts where currency='gold';
 end if;
 if v_count<>1 then
   raise exception 'Expected exactly one E1 gold account, found %. No changes made.',v_count;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text||':opening-gold-2026-10-15',0));
 select balance into v_balance from rq_v2.economy_accounts
 where user_id=v_uid and currency='gold' for update;
 select * into v_existing from rq_v2.economy_events
 where user_id=v_uid and event_key=v_key;
 if found then
   if v_existing.currency<>'gold' or v_existing.amount<>4987 then
     raise exception 'Migration key already used with different amount/currency. No changes made.';
   end if;
   if v_balance<>5007 then
     raise exception 'Migration already applied but current gold is %, not 5007. No changes made.',v_balance;
   end if;
   raise notice 'Already migrated: 5007 gold. No changes made.';
 else
   if v_balance<>20 then
     raise exception 'Expected 20 starting gold; found %. No changes made.',v_balance;
   end if;
   insert into rq_v2.economy_events(user_id,event_key,currency,amount)
   values(v_uid,v_key,'gold',4987);
   update rq_v2.economy_accounts set balance=balance+4987
   where user_id=v_uid and currency='gold';
   raise notice 'Migration applied: 20 + 4987 = 5007 gold.';
 end if;
end
$migration$;
commit;
-- Verification (must return 5007 and one migration event):
select a.currency,a.balance,e.event_key,e.amount as migration_amount
from rq_v2.economy_accounts a
join rq_v2.economy_events e on e.user_id=a.user_id
where a.currency='gold' and e.event_key='migration:2026-10-15:legacy-focus-to-gold:approved-4987';
