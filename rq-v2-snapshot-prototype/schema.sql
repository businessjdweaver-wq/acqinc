-- RQ V2 Snapshot Inbox. Run in existing Supabase project's SQL editor.
create schema if not exists rq_v2;
create table if not exists rq_v2.snapshot_contexts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 80), created_at timestamptz not null default now(),
 unique(user_id,name)
);
create table if not exists rq_v2.snapshots (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 context_id uuid references rq_v2.snapshot_contexts(id) on delete set null,
 note text check (length(note)<=2000), storage_path text not null unique,
 image_bytes integer not null check(image_bytes>0), image_mime text not null check(image_mime in ('image/webp','image/jpeg')),
 status text not null default 'stashed' check(status in ('stashed','conversion_requested','discarded')),
 created_at timestamptz not null default now()
);
create table if not exists rq_v2.snapshot_presentations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 snapshot_id uuid not null references rq_v2.snapshots(id) on delete cascade,
 outcome text not null check(outcome in ('shown','deferred','conversion_requested','discarded')),
 presented_at timestamptz not null default now()
);
create index if not exists snapshots_user_status_idx on rq_v2.snapshots(user_id,status,created_at);
create index if not exists presentations_user_snapshot_idx on rq_v2.snapshot_presentations(user_id,snapshot_id,presented_at);
alter table rq_v2.snapshot_contexts enable row level security;
alter table rq_v2.snapshots enable row level security;
alter table rq_v2.snapshot_presentations enable row level security;
create policy "own contexts" on rq_v2.snapshot_contexts for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own snapshots" on rq_v2.snapshots for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own presentations" on rq_v2.snapshot_presentations for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
-- Validate context ownership even if a caller guesses another user's context UUID.
create or replace function rq_v2.validate_snapshot_context() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.context_id is not null and not exists(select 1 from rq_v2.snapshot_contexts where id=new.context_id and user_id=new.user_id) then
  raise exception 'Context does not belong to user';
 end if;
 return new;
end $$;
create trigger validate_snapshot_context_before_write before insert or update on rq_v2.snapshots for each row execute function rq_v2.validate_snapshot_context();
-- Storage bucket, private by default. Keep V1 bucket(s) untouched.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('rq-v2-snapshots','rq-v2-snapshots',false,300000,array['image/webp','image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=300000,allowed_mime_types=array['image/webp','image/jpeg'];
create policy "rq v2 snapshot read" on storage.objects for select to authenticated
 using(bucket_id='rq-v2-snapshots' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "rq v2 snapshot upload" on storage.objects for insert to authenticated
 with check(bucket_id='rq-v2-snapshots' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "rq v2 snapshot delete" on storage.objects for delete to authenticated
 using(bucket_id='rq-v2-snapshots' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Expose rq_v2 in Supabase API settings > Exposed schemas, and grant access.
grant usage on schema rq_v2 to authenticated;
grant select,insert,update,delete on all tables in schema rq_v2 to authenticated;
grant usage on schema rq_v2 to service_role;
grant all on all tables in schema rq_v2 to service_role;
