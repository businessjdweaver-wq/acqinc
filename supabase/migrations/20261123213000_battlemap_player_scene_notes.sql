DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.battlemap_scene_customize(uuid,text,text,text,jsonb,bigint)'::regprocedure) INTO definition;
 IF length(definition)-length(replace(definition,$old$  if action='area_delete' then
   st.scene:=st.scene #- array['areas',idx::text];
  else
   if coalesce(value->>'shape','') not in$old$,''))<>length($old$  if action='area_delete' then
   st.scene:=st.scene #- array['areas',idx::text];
  else
   if coalesce(value->>'shape','') not in$old$) THEN
  RAISE EXCEPTION 'Unexpected scene area handler';
 END IF;
 EXECUTE replace(definition,$old$  if action='area_delete' then
   st.scene:=st.scene #- array['areas',idx::text];
  else
   if coalesce(value->>'shape','') not in$old$,$new$  if action='area_update' and (obj->>'shape'='player_note') is distinct from (value->>'shape'='player_note') then
   return jsonb_build_object('error','A scene note must remain a note.');
  end if;
  if action='area_delete' then
   st.scene:=st.scene #- array['areas',idx::text];
  elsif value->>'shape'='player_note' then
   if jsonb_typeof(value->'origin') is distinct from 'array' then
    return jsonb_build_object('error','Choose a square on the map.');
   end if;
   if jsonb_array_length(value->'origin')<>3 or exists (
    select from jsonb_array_elements(value->'origin') coordinate where jsonb_typeof(coordinate)<>'number'
   ) then return jsonb_build_object('error','Choose a square on the map.'); end if;
   if not battlemap_room.move_floor_contains(st.scene,(value->'origin'->>0)::numeric,(value->'origin'->>1)::numeric,0)
      or (value->'origin'->>2)::numeric not between 0 and 100 then
    return jsonb_build_object('error','Choose a square on the map.');
   end if;
   if jsonb_typeof(value->'notes') is distinct from 'string' or char_length(trim(value->>'notes')) not between 1 and 4000
      or coalesce(value->>'title','')<>left(coalesce(value->>'title',''),120)
      or coalesce(value->>'marker','') !~ '^(0|[1-9]|1[0-9]|20|★|⚔|☠|👑|🚪|🔒|🔑|💎|📜|🧩|❓|!|👁|🕯|🔥|💧|🌿|🕸|🪤|🌀)$' then
    return jsonb_build_object('error','Invalid scene note.');
   end if;
   obj:=jsonb_build_object('roomId',object_id,'areaOwner',actor,'shape','player_note','size',1,'angle',0,
    'origin',value->'origin','marker',value->>'marker','title',coalesce(value->>'title',''),'notes',trim(value->>'notes'));
   if action='area_create' then
    st.scene:=jsonb_set(st.scene,'{areas}',coalesce(st.scene->'areas','[]')||jsonb_build_array(obj));
   else
    st.scene:=jsonb_set(st.scene,array['areas',idx::text],obj);
   end if;
  else
   if coalesce(value->>'shape','') not in$new$);
END;
$migration$;
