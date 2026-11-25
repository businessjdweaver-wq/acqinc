CREATE OR REPLACE FUNCTION rq_v2.redeem_encounter_power_pull(p_token_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); t rq_v2.encounter_power_pull_tokens%rowtype; c public.rq_v2_collection%rowtype; v_unlocked boolean; v_character integer; v_card jsonb;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select * into t from rq_v2.encounter_power_pull_tokens where id=p_token_id and user_id=u for update;
 if not found then raise exception 'Pull token not found'; end if;
 if t.redeemed_at is not null then raise exception 'Pull token already redeemed'; end if;
 select * into c from public.rq_v2_collection where user_id=u for update;
 if not found then raise exception 'Initialize collection first'; end if;
 v_unlocked:=(select count(*)>=3 from pg_catalog.jsonb_array_elements(c.roster_members) x where (x.value->>'archetype')::integer<6);
 v_character:=case when v_unlocked and random()<0.20 then 6+floor(random()*18)::integer else floor(random()*6)::integer end;
 v_card:=pg_catalog.jsonb_build_object('id',gen_random_uuid(),'character',v_character,'slot',floor(random()*3)::integer,'level',1,'rarity',t.rarity,'receivedAt',extract(epoch from now())*1000,'expiresAt',null,'goldValue',25,'source','encounter-'||t.rarity,'encounterAdmission',t.admission_id);
 update public.rq_v2_collection set inbox=inbox||pg_catalog.jsonb_build_array(v_card),updated_at=now() where user_id=u;
 update rq_v2.encounter_power_pull_tokens set redeemed_at=now() where id=p_token_id;
 return pg_catalog.jsonb_build_object('card',v_card,'rarity',t.rarity);
end $function$
