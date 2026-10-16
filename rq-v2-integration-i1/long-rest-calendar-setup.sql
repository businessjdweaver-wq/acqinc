-- Run once in the Supabase SQL editor. Authenticated user only; server calendar in America/Indiana/Indianapolis.
create table if not exists rq_v2.long_rest_claims (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_rest_date date not null,
 updated_at timestamptz not null default now()
);
alter table rq_v2.long_rest_claims enable row level security;
revoke all on rq_v2.long_rest_claims from anon, authenticated;
create or replace function rq_v2.claim_long_rest(p_action text default 'claim')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
 v_today date := (now() at time zone 'America/Indiana/Indianapolis')::date;
 v_previous date;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if p_action not in ('claim','status') then raise exception 'Invalid action'; end if;
 if p_action='status' then
   select last_rest_date into v_previous from rq_v2.long_rest_claims where user_id=v_user;
   return jsonb_build_object('claimed',false,'eligible',v_previous is distinct from v_today,'rest_date',v_today,'last_rest_date',v_previous);
 end if;
 insert into rq_v2.long_rest_claims(user_id,last_rest_date)
 values(v_user,v_today)
 on conflict(user_id) do update
 set last_rest_date=excluded.last_rest_date,updated_at=now()
 where rq_v2.long_rest_claims.last_rest_date < excluded.last_rest_date;
 if found then
   return jsonb_build_object('claimed',true,'rest_date',v_today);
 end if;
 return jsonb_build_object('claimed',false,'rest_date',v_today);
end $$;
revoke all on function rq_v2.claim_long_rest(text) from public,anon;
grant usage on schema rq_v2 to authenticated;
grant execute on function rq_v2.claim_long_rest(text) to authenticated;
