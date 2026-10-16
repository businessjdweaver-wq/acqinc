-- E3 durable checkpoints. Install after e3-encounter-recovery.sql.
begin;
alter table rq_v2.gold_encounters add column if not exists checkpoint jsonb;
alter table rq_v2.gold_encounters add column if not exists checkpoint_at timestamptz;
create or replace function rq_v2.save_gold_encounter_checkpoint(p_encounter_id uuid,p_checkpoint jsonb)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in required';end if;
 if p_checkpoint is null or jsonb_typeof(p_checkpoint)<>'object' or octet_length(p_checkpoint::text)>150000 then raise exception 'Invalid or oversized checkpoint';end if;
 if (p_checkpoint->>'version') is distinct from 'e3.1' then raise exception 'Unsupported checkpoint version';end if;
 update rq_v2.gold_encounters set checkpoint=p_checkpoint,checkpoint_at=now()
 where user_id=v_uid and encounter_id=p_encounter_id and status='active';
 if not found then raise exception 'Active encounter not found';end if;
 return true;
end $$;
revoke all on function rq_v2.save_gold_encounter_checkpoint(uuid,jsonb) from public,anon;
grant execute on function rq_v2.save_gold_encounter_checkpoint(uuid,jsonb) to authenticated;
commit;
