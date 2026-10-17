-- Moon check-in loyalty bundle. Deploy before switching dailies.html.
-- Server-only atomic grants; one receipt per user/day.
create table if not exists rq_v2.daily_bundle_claims (
 user_id uuid not null references auth.users(id) on delete cascade,
 local_date date not null,
 claim_number integer not null,
 streak integer not null,
 rewards jsonb not null,
 claimed_at timestamptz not null default now(),
 primary key(user_id,local_date)
);
alter table rq_v2.daily_bundle_claims enable row level security;
revoke all on rq_v2.daily_bundle_claims from public,anon,authenticated;
grant select on rq_v2.daily_bundle_claims to authenticated;
drop policy if exists daily_bundle_owner on rq_v2.daily_bundle_claims;
create policy daily_bundle_owner on rq_v2.daily_bundle_claims for select to authenticated using(user_id=(select auth.uid()));

create or replace function rq_v2.claim_daily_bundle(p_local_date date)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 u uuid:=auth.uid();
 old_reward jsonb;
 n integer; streak_count integer:=1; prev_date date; day_row record;
 gold_amount integer; ticket_amount integer:=0; checked_count integer:=0; support_id text; support_charges integer:=3;
 card jsonb:=null; cards jsonb:='[]'::jsonb; monthly boolean; result jsonb;
 choices text[]:=array['fox','ranger','potion','fire','shuffle','row','exchange'];
 unlocked boolean:=false;
begin
 if u is null then raise exception 'Authentication required';end if;
 if p_local_date<>(now() at time zone 'America/Indiana/Indianapolis')::date then raise exception 'Only the current date is eligible';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':daily-bundle',0));
 select rewards into old_reward from rq_v2.daily_bundle_claims where user_id=u and local_date=p_local_date;
 if found then return old_reward||jsonb_build_object('already_claimed',true);end if;
 if not exists(select 1 from rq_v2.daily_logs where user_id=u and local_date=p_local_date) then raise exception 'Submit a daily log first';end if;
 if exists(select 1 from rq_v2.daily_reward_claims where user_id=u and local_date=p_local_date) then raise exception 'Legacy reward already claimed for this date';end if;
 select count(*)+1 into n from rq_v2.daily_bundle_claims where user_id=u;
 prev_date:=p_local_date;
 for day_row in select local_date from rq_v2.daily_bundle_claims where user_id=u and local_date<p_local_date order by local_date desc loop
  if day_row.local_date<>prev_date-1 then exit;end if;
  streak_count:=streak_count+1;prev_date:=day_row.local_date;
 end loop;
 gold_amount:=80+floor(random()*41)::integer+least(100,25*((streak_count-1)/7));
 support_id:=choices[1+floor(random()*array_length(choices,1))::integer];
 monthly:=(n%30=0);
 select count(*) into checked_count from rq_v2.daily_logs l cross join lateral jsonb_each(l.activities) a where l.user_id=u and l.local_date=p_local_date and a.value='true'::jsonb;
 ticket_amount:=checked_count/2;
 perform public.rq_v2_initialize();
 insert into public.rq_v2_support_inventory(user_id) values(u) on conflict do nothing;
 update public.rq_v2_support_inventory
 set charges=jsonb_set(charges,array[support_id],to_jsonb(coalesce((charges->>support_id)::integer,0)+support_charges)),updated_at=now()
 where user_id=u;
 insert into rq_v2.economy_accounts(user_id,currency,balance) values(u,'gold',gold_amount)
 on conflict(user_id,currency) do update set balance=rq_v2.economy_accounts.balance+excluded.balance;
 insert into rq_v2.economy_events(user_id,event_key,currency,amount)
 values(u,'daily-bundle:'||p_local_date::text,'gold',gold_amount);
 if ticket_amount>0 then
  insert into rq_v2.economy_accounts(user_id,currency,balance) values(u,'encounter_tickets',ticket_amount)
  on conflict(user_id,currency) do update set balance=rq_v2.economy_accounts.balance+excluded.balance;
  insert into rq_v2.economy_events(user_id,event_key,currency,amount)
  values(u,'daily-bundle-tickets:'||p_local_date::text,'encounter_tickets',ticket_amount);
 end if;
 if random()<0.2 then
  select count(distinct (x.value->>'archetype')::integer)>=3 into unlocked
  from public.rq_v2_collection s cross join lateral jsonb_array_elements(s.roster_members) x
  where s.user_id=u and (x.value->>'archetype')::integer<6;
  card:=jsonb_build_object('id',gen_random_uuid(),'character',floor(random()*(case when coalesce(unlocked,false) then 12 else 6 end))::integer,
   'slot',floor(random()*3)::integer,'level',1,'receivedAt',extract(epoch from now())*1000,'expiresAt',null,'goldValue',25,'source','daily-bundle');
  cards:=jsonb_build_array(card);
  update public.rq_v2_collection set inbox=inbox||cards,updated_at=now() where user_id=u;
 end if;
 if monthly then update public.rq_v2_collection set roster_slots=roster_slots+1,updated_at=now() where user_id=u;end if;
 result:=jsonb_build_object('claim_number',n,'streak',streak_count,'gold',gold_amount,'tickets',ticket_amount,'checked_count',checked_count,'support',support_id,'support_charges',support_charges,'cards',cards,'roster_slot',monthly,'already_claimed',false);
 insert into rq_v2.daily_bundle_claims(user_id,local_date,claim_number,streak,rewards)
 values(u,p_local_date,n,streak_count,result);
 return result;
end $$;
revoke all on function rq_v2.claim_daily_bundle(date) from public,anon;
grant execute on function rq_v2.claim_daily_bundle(date) to authenticated;
