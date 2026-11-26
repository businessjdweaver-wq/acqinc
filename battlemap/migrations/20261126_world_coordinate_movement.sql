CREATE OR REPLACE FUNCTION battlemap_room.move_floor_contains(scene jsonb, px numeric, py numeric, footprint numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
DECLARE
 entry jsonb; grid jsonb; matrix jsonb; image jsonb; crop jsonb;
 width numeric := 40; depth numeric := 40; left_edge numeric; top_edge numeric;
 ox numeric; oy numeric; xx numeric; xy numeric; yx numeric; yy numeric;
 wx numeric; wy numeric; u numeric; v numeric; i integer;
 image_width numeric; image_depth numeric; theta double precision;
 lo_u numeric := 0; hi_u numeric := 1; lo_v numeric := 0; hi_v numeric := 1;
 epsilon constant numeric := 0.0000001;
BEGIN
 SELECT a INTO entry FROM jsonb_array_elements(coalesce(scene->'areas','[]'::jsonb)) a
 WHERE a->>'shape'='appearance' LIMIT 1;
 grid:=entry->'grid';
 IF jsonb_typeof(grid->'width')='number' AND jsonb_typeof(grid->'depth')='number'
    AND (grid->>'width')::numeric BETWEEN 10 AND 100 AND (grid->>'depth')::numeric BETWEEN 10 AND 100
    AND trunc((grid->>'width')::numeric)=(grid->>'width')::numeric
    AND trunc((grid->>'depth')::numeric)=(grid->>'depth')::numeric THEN
  width:=(grid->>'width')::numeric; depth:=(grid->>'depth')::numeric;
 END IF;
 left_edge:=CASE WHEN jsonb_typeof(grid->'floorOriginX')='number' THEN (grid->>'floorOriginX')::numeric ELSE 0 END;
 top_edge:=CASE WHEN jsonb_typeof(grid->'floorOriginY')='number' THEN (grid->>'floorOriginY')::numeric ELSE 0 END;
 ox:=0; oy:=0; xx:=1; xy:=0; yx:=0; yy:=1;
 image:=entry->'appearance'->'floorImage';
 IF entry->'appearance'->>'ground'='image'
    AND jsonb_typeof(image->'width')='number' AND jsonb_typeof(image->'depth')='number'
    AND (image->>'width')::numeric>0 AND (image->>'depth')::numeric>0 THEN
  image_width:=(image->>'width')::numeric/5; image_depth:=(image->>'depth')::numeric/5;
  theta:=radians(CASE WHEN jsonb_typeof(image->'rotation')='number' THEN (image->>'rotation')::double precision ELSE 0 END);
  wx:=ox+xx*(px+footprint/2)+yx*(py+footprint/2)
      - CASE WHEN jsonb_typeof(image->'x')='number' THEN (image->>'x')::numeric/5 ELSE 0 END;
  wy:=oy+xy*(px+footprint/2)+yy*(py+footprint/2)
      - CASE WHEN jsonb_typeof(image->'y')='number' THEN (image->>'y')::numeric/5 ELSE 0 END;
  u:=.5+(wx*cos(theta)+wy*sin(theta))/image_width;
  v:=.5+(-wx*sin(theta)+wy*cos(theta))/image_depth;
  crop:=image->'crop';
  IF jsonb_typeof(crop)='array' THEN
   SELECT greatest(0,min((point->>0)::numeric)),least(1,max((point->>0)::numeric)),
          greatest(0,min((point->>1)::numeric)),least(1,max((point->>1)::numeric))
   INTO lo_u,hi_u,lo_v,hi_v
   FROM jsonb_array_elements(crop) node
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(node)='array' THEN node ELSE '[]'::jsonb END) point
   WHERE jsonb_typeof(point->0)='number' AND jsonb_typeof(point->1)='number';
  END IF;
  IF hi_u>lo_u AND hi_v>lo_v AND u BETWEEN lo_u-epsilon/image_width AND hi_u+epsilon/image_width
      AND v BETWEEN lo_v-epsilon/image_depth AND hi_v+epsilon/image_depth THEN RETURN true; END IF;
 END IF;
 FOR i IN 0..3 LOOP
  u:=px+CASE WHEN i IN (1,2) THEN footprint ELSE 0 END;
  v:=py+CASE WHEN i IN (2,3) THEN footprint ELSE 0 END;
  wx:=ox+xx*u+yx*v; wy:=oy+xy*u+yy*v;
  IF wx NOT BETWEEN left_edge-epsilon AND left_edge+width+epsilon
     OR wy NOT BETWEEN top_edge-epsilon AND top_edge+depth+epsilon THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.battlemap_scene_move(ticket uuid, requested_scene text, token_id text, px numeric, py numeric, pz numeric, expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st battlemap_room.encounters%rowtype; player battlemap_room.players%rowtype; obj jsonb; idx integer; sz integer; on_stair boolean; on_landing boolean;
begin
 perform 1 from battlemap_room.scene_lifecycle where singleton for share;
 if requested_scene is null or battlemap_room.scene_viewer(ticket, requested_scene) is null then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 if not exists(select 1 from battlemap_room.encounters e where e.scene_id=requested_scene) then
  return jsonb_build_object('error','This scene is unavailable.');
 end if;
 perform set_config('battlemap.encounter_scope', (select e.event_scope::text
  from battlemap_room.encounters e where e.scene_id=requested_scene), true);
 select * into st from battlemap_room.encounters where scene_id=requested_scene for update;
 if battlemap_room.scene_viewer(ticket, requested_scene) is distinct from 'player' then return jsonb_build_object('error','This scene is unavailable.');end if;
 if (st.paused and battlemap_room.scene_pause_applies(ticket)) or st.scene is null then return jsonb_build_object('error','The scene is paused.'); end if;
 if st.revision<>expected_revision then return jsonb_build_object('error','The scene changed. Try again after it refreshes.'); end if;
 select * into player from battlemap_room.players where token=ticket;
 if not found then return jsonb_build_object('error','Choose a profile again.'); end if;
 select t,ord-1 into obj,idx from jsonb_array_elements(st.scene->'tokens') with ordinality as tt(t,ord) where t->>'roomId'=token_id limit 1;
 if obj is null or obj->>'incognito'='true' or not exists(select 1 from battlemap_room.controllers c join battlemap_room.profiles p on p.name=c.profile and p.approved where c.profile=player.profile and c.standee_id=token_id) then
  return jsonb_build_object('error','Choose your character standee.');
 end if;
 sz:=(obj->>'size')::integer;
 on_stair:=exists(
   select 1 from jsonb_array_elements(st.scene->'pieces') t
   where coalesce(t->>'stairTread'='true',false) and t->>'type'='volume' and t->>'form' is null
    and pz=(t->>'z')::numeric+coalesce((t->'extents'->>2)::numeric,1)
    and px+sz/2.0>=(t->>'x')::numeric
    and px+sz/2.0<(t->>'x')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then coalesce((t->'extents'->>1)::numeric,2) else coalesce((t->'extents'->>0)::numeric,2) end
    and py+sz/2.0>=(t->>'y')::numeric
    and py+sz/2.0<(t->>'y')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then coalesce((t->'extents'->>0)::numeric,2) else coalesce((t->'extents'->>1)::numeric,2) end
  );
 on_landing:=on_stair or (coalesce(obj->>'flying','false')<>'true' and pz<>(obj->>'z')::numeric and abs(pz-(obj->>'z')::numeric)<=1 and (pz=0 or exists(
   select 1 from jsonb_array_elements(st.scene->'pieces') t
   join (values ('terrace',3,2,1),('stone',2,2,2),('pillar',1,1,3),('bridge',3,1,1),('crate',1,1,1),('fountain',1,1,1),('volume',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>'type'
   cross join lateral (select
    case when defaults.kind='volume' then coalesce((t->'extents'->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind='volume' then coalesce((t->'extents'->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind='volume' then coalesce((t->'extents'->>2)::numeric,defaults.h) else defaults.h end h
   ) v
   where t->>'form' is null and pz=(t->>'z')::numeric+v.h
    and px+sz/2.0>=(t->>'x')::numeric
    and px+sz/2.0<(t->>'x')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then v.d else v.w end
    and py+sz/2.0>=(t->>'y')::numeric
    and py+sz/2.0<(t->>'y')::numeric+case when coalesce((t->>'r')::int,0)%2=1 then v.w else v.d end
  )));
 if px is null or py is null or pz is null or px::text in ('NaN','Infinity','-Infinity') or py::text in ('NaN','Infinity','-Infinity') or pz::text in ('NaN','Infinity','-Infinity') or pz<0 or not (battlemap_room.move_floor_contains(st.scene,px,py,sz) or (pz>0 and exists (select 1 from jsonb_array_elements(st.scene->'pieces') t where t->>'type'='volume' and t->>'form'='cylinder' and abs(pz-(t->>'z')::numeric-coalesce((t->'extents'->>2)::numeric,1))<0.0000001 and power((px+sz/2.0-(t->>'x')::numeric-coalesce((t->'extents'->>0)::numeric,2)/2)/ (coalesce((t->'extents'->>0)::numeric,2)/2),2)+power((py+sz/2.0-(t->>'y')::numeric-coalesce((t->'extents'->>1)::numeric,2)/2)/(coalesce((t->'extents'->>1)::numeric,2)/2),2)<=1))) or
    (obj->>'flying'='true' and pz<>(obj->>'z')::numeric) then return jsonb_build_object('error','That destination is outside the map.'); end if;
 -- Destination legality is adjudicated by the GM, not the VTT.
 st.scene:=jsonb_set(st.scene,array['tokens',idx::text],obj||jsonb_build_object('x',px,'y',py,'z',pz));
 -- On ordinary movement, end Dancing Lights when any mote exceeds 120 ft from its caster.
 st.scene:=jsonb_set(st.scene,'{areas}',coalesce((select jsonb_agg(a order by ord)
 from jsonb_array_elements(coalesce(st.scene->'areas','[]'::jsonb)) with ordinality q(a,ord)
 where a->>'spell' is distinct from 'dancing'
 or a->>'spellOwner' is distinct from player.profile
 or not exists(select 1 from jsonb_array_elements(coalesce(st.scene->'areas','[]'::jsonb)) light
   where light->>'spell'='dancing' and light->>'spellOwner'=player.profile
   and power((light->'origin'->>0)::numeric-px-sz/2.0,2)
   +power((light->'origin'->>1)::numeric-py-sz/2.0,2)
   +power((light->'origin'->>2)::numeric+coalesce((light->>'lightElevation')::numeric,0)-pz,2)>576)
 ),'[]'::jsonb));
 update battlemap_room.encounters set scene=st.scene,revision=revision+1 where scene_id=requested_scene;
 return jsonb_build_object('ok',true,'revision',st.revision+1);
end $function$
;
