-- Apply after the two existing pool expansion scripts. IDs 24 and 25 append Grimm and Hester.
-- Existing prices, unlock gates, odds, and roster capacity are unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.rq_v2_purchase(p_item text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u uuid:=auth.uid(); s public.rq_v2_collection; old_result jsonb; price integer; result jsonb; card jsonb; cards jsonb:='[]'::jsonb; gold_after bigint; unlocked boolean; hero_success boolean; v_idx integer; v_slot integer; v_count integer;
begin
 if u is null then raise exception 'Authentication required';end if;
 if p_request_id is null then raise exception 'Request ID required';end if;
 if p_item not in ('card_pull','hero_card_pull','roster_slot') or p_item is null then raise exception 'Unknown store item';end if;
 perform public.rq_v2_initialize();
 select * into s from public.rq_v2_collection where user_id=u for update;
 select r.result into old_result from public.rq_v2_purchase_receipts r where r.user_id=u and r.request_id=p_request_id;
 if old_result is not null then
  if (select item from public.rq_v2_purchase_receipts where user_id=u and request_id=p_request_id)<>p_item then raise exception 'Request ID reused for different item';end if;
  return old_result;
 end if;
 price:=case p_item when 'card_pull' then 250 when 'hero_card_pull' then 500 else 1500 end;
 update rq_v2.economy_accounts set balance=balance-price where user_id=u and currency='gold' and balance>=price returning balance into gold_after;
 if not found then raise exception 'Insufficient V2 gold';end if;
 if p_item in ('card_pull','hero_card_pull') then
  unlocked:=(select count(*)>=3 from jsonb_array_elements(s.roster_members) x where (x.value->>'archetype')::integer<6);
  hero_success:=(p_item='hero_card_pull' and unlocked and random()<0.75);
  v_count:=case when p_item='hero_card_pull' and not hero_success then 3 else 1 end;
  for v_idx in 1..v_count loop
   v_slot:=floor(random()*3)::integer;
   card:=jsonb_build_object('id',gen_random_uuid(),'character',
     (case when hero_success then 6+floor(random()*20)::integer
           when unlocked and random()<0.20 then 6+floor(random()*20)::integer
           else floor(random()*6)::integer end),
     'slot',v_slot,'level',1,'receivedAt',extract(epoch from now())*1000,
     'expiresAt',null,'goldValue',25,'source',case when p_item='hero_card_pull' then 'hero-store' else 'store' end);
   cards:=cards||jsonb_build_array(card);
  end loop;
  update public.rq_v2_collection set inbox=inbox||cards,updated_at=now() where user_id=u;
 else
  update public.rq_v2_collection set roster_slots=roster_slots+1,updated_at=now() where user_id=u;
 end if;
 insert into rq_v2.economy_events(user_id,event_key,currency,amount) values(u,'v2:store:'||p_request_id::text,'gold',-price);
 result:=jsonb_build_object('item',p_item,'price',price,'gold',gold_after,'rosterSlots',s.roster_slots+case when p_item='roster_slot' then 1 else 0 end,'card',case when jsonb_array_length(cards)=1 then cards->0 else null end,'cards',cards,'heroSuccess',coalesce(hero_success,false));
 insert into public.rq_v2_purchase_receipts(user_id,request_id,item,price,result) values(u,p_request_id,p_item,price,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.rq_v2_redeem_bonus_pull()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u uuid:=auth.uid(); s public.rq_v2_collection; card jsonb; unlocked boolean;
begin
 if u is null then raise exception 'Authentication required';end if;
 perform public.rq_v2_initialize();
 select * into s from public.rq_v2_collection where user_id=u for update;
 if s.bonus_pull_tokens<1 then raise exception 'No earned card pulls available';end if;
 unlocked:=(select count(*)>=3 from jsonb_array_elements(s.roster_members) x where (x.value->>'archetype')::integer<6);
 card:=jsonb_build_object('id',gen_random_uuid(),'character',(case when unlocked and random()<0.20 then 6+floor(random()*20)::integer else floor(random()*6)::integer end),'slot',floor(random()*3)::integer,'level',1,'receivedAt',extract(epoch from now())*1000,'expiresAt',null,'goldValue',25,'source','nightly-card-pull');
 update public.rq_v2_collection set bonus_pull_tokens=bonus_pull_tokens-1,inbox=inbox||jsonb_build_array(card),updated_at=now() where user_id=u;
 return jsonb_build_object('card',card,'remaining',s.bonus_pull_tokens-1);
end $function$;
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
 v_character:=case when v_unlocked and random()<0.20 then 6+floor(random()*20)::integer else floor(random()*6)::integer end;
 v_card:=pg_catalog.jsonb_build_object('id',gen_random_uuid(),'character',v_character,'slot',floor(random()*3)::integer,'level',1,'rarity',t.rarity,'receivedAt',extract(epoch from now())*1000,'expiresAt',null,'goldValue',25,'source','encounter-'||t.rarity,'encounterAdmission',t.admission_id);
 update public.rq_v2_collection set inbox=inbox||pg_catalog.jsonb_build_array(v_card),updated_at=now() where user_id=u;
 update rq_v2.encounter_power_pull_tokens set redeemed_at=now() where id=p_token_id;
 return pg_catalog.jsonb_build_object('card',v_card,'rarity',t.rarity);
end $function$;

COMMIT;
