-- Corvin is archetype 18. Keep the existing tier odds and recruitment gates.
DO $corvin$
BEGIN
 IF md5(pg_get_functiondef('public.rq_v2_purchase(text,uuid)'::regprocedure)) <> '63ab89fd4391fe8c305edbab5893951d' THEN
  RAISE EXCEPTION 'RQV2 function changed: rq_v2_purchase(text,uuid)';
 END IF;
 IF md5(pg_get_functiondef('public.rq_v2_card_action(uuid,text)'::regprocedure)) <> 'c5d39e0ec1b4414d18e330aa04e0fdd1' THEN
  RAISE EXCEPTION 'RQV2 function changed: rq_v2_card_action(uuid,text)';
 END IF;
 IF md5(pg_get_functiondef('public.rq_v2_recruit_card(uuid,text,uuid)'::regprocedure)) <> '595e4fcafe657ed1a391e87c27c130f3' THEN
  RAISE EXCEPTION 'RQV2 function changed: rq_v2_recruit_card(uuid,text,uuid)';
 END IF;
 IF md5(pg_get_functiondef('public.rq_v2_redeem_bonus_pull()'::regprocedure)) <> '0a71d89304cbefbfd55f05cffe64b5d1' THEN
  RAISE EXCEPTION 'RQV2 function changed: rq_v2_redeem_bonus_pull()';
 END IF;
 IF md5(pg_get_functiondef('rq_v2.redeem_encounter_power_pull(uuid)'::regprocedure)) <> '36b3664bac1ee9f8750fa4e1dff730e8' THEN
  RAISE EXCEPTION 'RQV2 function changed: rq_v2.redeem_encounter_power_pull(uuid)';
 END IF;
END;
$corvin$;

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
 v_character:=case when v_unlocked and random()<0.20 then 6+floor(random()*13)::integer else floor(random()*6)::integer end;
 v_card:=pg_catalog.jsonb_build_object('id',gen_random_uuid(),'character',v_character,'slot',floor(random()*3)::integer,'level',1,'rarity',t.rarity,'receivedAt',extract(epoch from now())*1000,'expiresAt',null,'goldValue',25,'source','encounter-'||t.rarity,'encounterAdmission',t.admission_id);
 update public.rq_v2_collection set inbox=inbox||pg_catalog.jsonb_build_array(v_card),updated_at=now() where user_id=u;
 update rq_v2.encounter_power_pull_tokens set redeemed_at=now() where id=p_token_id;
 return pg_catalog.jsonb_build_object('card',v_card,'rarity',t.rarity);
end $function$;

CREATE OR REPLACE FUNCTION public.rq_v2_recruit_card(p_card_id uuid, p_character_name text, p_target_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u uuid:=auth.uid(); s public.rq_v2_collection; c jsonb; members jsonb; member jsonb; newer jsonb; ident uuid; archetype integer; power_index integer; old_level integer; nm text;
begin
 if u is null then raise exception 'Sign in required';end if;
 select * into s from public.rq_v2_collection where user_id=u for update;
 if not found then raise exception 'Collection not initialized';end if;
 select x.value into c from jsonb_array_elements(s.inbox) x where x.value->>'id'=p_card_id::text limit 1;
 if c is null then raise exception 'Card not found';end if;
 archetype:=(c->>'character')::integer; power_index:=(c->>'slot')::integer;
 if archetype not between 0 and 127 or power_index not between 0 and 2 then raise exception 'Invalid card';end if;
 members:=s.roster_members;
 if p_target_id is null then
  nm:=trim(coalesce(p_character_name,''));
  if length(nm)<1 or length(nm)>60 then raise exception 'Character name must be 1 to 60 characters';end if;
  if jsonb_array_length(members)>=s.roster_slots then raise exception 'No free roster slot';end if;
  ident:=gen_random_uuid();
  newer:=jsonb_build_object('id',ident,'archetype',archetype,'name',nm,'level',case when archetype>=6 then 100 else 1 end,'powerLevels',jsonb_build_object(power_index::text,1),'powers',jsonb_build_array(power_index),'recruitedAt',now());
  members:=members||jsonb_build_array(newer);
 else
  select x.value into member from jsonb_array_elements(members) x where x.value->>'id'=p_target_id::text limit 1;
  if member is null then raise exception 'Target character not found';end if;
  if (member->>'archetype')::integer<>archetype then raise exception 'Card archetype does not match character';end if;
  old_level:=coalesce((member->'powerLevels'->>power_index::text)::integer,0);
  if old_level>=4 then raise exception 'Power already at maximum level';end if;
  newer:=jsonb_set(member,'{powerLevels}',coalesce(member->'powerLevels','{}'::jsonb)||jsonb_build_object(power_index::text,old_level+1),true);
  newer:=jsonb_set(newer,'{powers}',(select coalesce(jsonb_agg(distinct v),'[]'::jsonb) from jsonb_array_elements(coalesce(member->'powers','[]'::jsonb)||jsonb_build_array(power_index)) v),true);
  select coalesce(jsonb_agg(case when x.value->>'id'=p_target_id::text then newer else x.value end),'[]'::jsonb) into members from jsonb_array_elements(members) x;
  ident:=p_target_id;
 end if;
 update public.rq_v2_collection set roster_members=members,inbox=(select coalesce(jsonb_agg(x.value),'[]'::jsonb) from jsonb_array_elements(s.inbox) x where x.value->>'id'<>p_card_id::text),updated_at=now() where user_id=u;
 return jsonb_build_object('id',ident,'name',newer->>'name','archetype',archetype,'power',power_index,'powerLevel',(newer->'powerLevels'->>power_index::text)::integer);
end $function$;

CREATE OR REPLACE FUNCTION public.rq_v2_card_action(p_card_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u uuid:=auth.uid(); s public.rq_v2_collection; c jsonb; r jsonb; k text; lvl integer; idx integer; roster_count integer; new_inbox jsonb; gold_after bigint;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_action not in ('recruit','liquidate') or p_action is null then raise exception 'Invalid action';end if;
 select * into s from public.rq_v2_collection where user_id=u for update;
 if not found then raise exception 'Initialize collection first';end if;
 select x.value into c from jsonb_array_elements(s.inbox) x(value) where x.value->>'id'=p_card_id::text limit 1;
 if c is null then raise exception 'Card not found';end if;
 idx:=(c->>'character')::integer;
 if idx<0 or idx>=128 or (c->>'slot')::integer not between 0 and 2 then raise exception 'Invalid card';end if;
 new_inbox:=(select coalesce(jsonb_agg(x.value),'[]'::jsonb) from jsonb_array_elements(s.inbox) x(value) where x.value->>'id'<>p_card_id::text);
 k:=idx::text;r:=coalesce(s.roster->k,'{}'::jsonb);lvl:=coalesce((r->'powerLevels'->>((c->>'slot')::text))::integer,0);
 if p_action='liquidate' or lvl>=4 then
 update rq_v2.economy_accounts set balance=balance+25 where user_id=u and currency='gold' returning balance into gold_after;
 if not found then raise exception 'Gold account missing';end if;
 update public.rq_v2_collection set inbox=new_inbox,updated_at=now() where user_id=u;
 insert into rq_v2.economy_events(user_id,event_key,currency,amount) values(u,'v2:card:convert:'||p_card_id::text,'gold',25);
 return jsonb_build_object('action',case when lvl>=4 and p_action='recruit' then 'maxed_duplicate' else 'liquidate' end,'gold',gold_after);
 end if;
 roster_count:=(select count(*) from jsonb_each(s.roster) t where (t.value->>'unlocked')::boolean is true);
 if coalesce((r->>'unlocked')::boolean,false)=false and roster_count>=s.roster_slots then raise exception 'No free roster slot';end if;
 r:=r||jsonb_build_object('unlocked',true,'level',coalesce(r->'level','1'::jsonb));
 r:=jsonb_set(r,'{powerLevels}',coalesce(r->'powerLevels','{}'::jsonb)||jsonb_build_object((c->>'slot')::text,lvl+1),true);
 r:=jsonb_set(r,'{powers}',(select coalesce(jsonb_agg(distinct v),'[]'::jsonb) from jsonb_array_elements(coalesce(r->'powers','[]'::jsonb)||jsonb_build_array((c->>'slot')::integer)) v),true);
 update public.rq_v2_collection set roster=jsonb_set(roster,array[k],r,true),inbox=new_inbox,updated_at=now() where user_id=u;
 return jsonb_build_object('action','recruit','character',idx,'slot',(c->>'slot')::integer,'level',lvl+1);
end $function$;

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
     (case when hero_success then 6+floor(random()*13)::integer
           when unlocked and random()<0.20 then 6+floor(random()*13)::integer
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
 card:=jsonb_build_object('id',gen_random_uuid(),'character',(case when unlocked and random()<0.20 then 6+floor(random()*13)::integer else floor(random()*6)::integer end),'slot',floor(random()*3)::integer,'level',1,'receivedAt',extract(epoch from now())*1000,'expiresAt',null,'goldValue',25,'source','nightly-card-pull');
 update public.rq_v2_collection set bonus_pull_tokens=bonus_pull_tokens-1,inbox=inbox||jsonb_build_array(card),updated_at=now() where user_id=u;
 return jsonb_build_object('card',card,'remaining',s.bonus_pull_tokens-1);
end $function$;
