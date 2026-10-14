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
