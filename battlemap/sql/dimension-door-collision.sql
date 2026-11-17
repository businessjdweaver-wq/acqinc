-- Dimension Door ignores corpses and standalone light objects. Living torch-bearers
-- and solid terrain still block; direct arrivals and fallback searches share the rules.
-- Preserve unrelated customization actions while honoring the actual scene bounds.
do $migration$
declare fn text; definition text;
begin
 for fn in select unnest(array['battlemap_room_customize','battlemap_scene_customize']) loop
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=fn;
  if (length(definition)-length(replace(definition,'     select coalesce(jsonb_agg(to_jsonb(q)),''[]'') into occupied from (
   select (t->>''x'')::numeric x,(t->>''y'')::numeric y,(t->>''z'')::numeric z,(t->>''size'')::numeric w,(t->>''size'')::numeric d,1 h,false support,coalesce(array_position(array[''tiny'',''small'',''medium'',''large'',''huge''],t->>''sizeCategory''),least(5,greatest(3,ceil((t->>''size'')::numeric)::int+2))) size_rank
    from jsonb_array_elements(st.scene->''tokens'') t where t->>''roomId'' not in (object_id,coalesce(passenger_id,''''))
   union all
   select (t->>''x'')::numeric,(t->>''y'')::numeric,(t->>''z'')::numeric,
    case when coalesce((t->>''r'')::int,0)%2=1 then v.d else v.w end,
    case when coalesce((t->>''r'')::int,0)%2=1 then v.w else v.d end,v.h,true support,null::integer size_rank
   from jsonb_array_elements(st.scene->''pieces'') t join (values (''terrace'',3,2,1),(''stone'',2,2,2),(''wall'',3,1,2),(''pillar'',1,1,3),(''column'',.5,.5,3),(''bridge'',3,1,1),(''crate'',1,1,1),(''fountain'',1,1,1),(''stream'',3,1,0),(''waterfall'',2,1,2),(''volume'',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>''type''
   cross join lateral (select
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>2)::numeric,defaults.h) else defaults.h end h
   ) v
     ) q where q.h>0;','')))/length('     select coalesce(jsonb_agg(to_jsonb(q)),''[]'') into occupied from (
   select (t->>''x'')::numeric x,(t->>''y'')::numeric y,(t->>''z'')::numeric z,(t->>''size'')::numeric w,(t->>''size'')::numeric d,1 h,false support,coalesce(array_position(array[''tiny'',''small'',''medium'',''large'',''huge''],t->>''sizeCategory''),least(5,greatest(3,ceil((t->>''size'')::numeric)::int+2))) size_rank
    from jsonb_array_elements(st.scene->''tokens'') t where t->>''roomId'' not in (object_id,coalesce(passenger_id,''''))
   union all
   select (t->>''x'')::numeric,(t->>''y'')::numeric,(t->>''z'')::numeric,
    case when coalesce((t->>''r'')::int,0)%2=1 then v.d else v.w end,
    case when coalesce((t->>''r'')::int,0)%2=1 then v.w else v.d end,v.h,true support,null::integer size_rank
   from jsonb_array_elements(st.scene->''pieces'') t join (values (''terrace'',3,2,1),(''stone'',2,2,2),(''wall'',3,1,2),(''pillar'',1,1,3),(''column'',.5,.5,3),(''bridge'',3,1,1),(''crate'',1,1,1),(''fountain'',1,1,1),(''stream'',3,1,0),(''waterfall'',2,1,2),(''volume'',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>''type''
   cross join lateral (select
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>2)::numeric,defaults.h) else defaults.h end h
   ) v
     ) q where q.h>0;')<>1 then raise exception 'Dimension Door source changed in %; review patch',fn; end if;
  definition:=replace(definition,'     select coalesce(jsonb_agg(to_jsonb(q)),''[]'') into occupied from (
   select (t->>''x'')::numeric x,(t->>''y'')::numeric y,(t->>''z'')::numeric z,(t->>''size'')::numeric w,(t->>''size'')::numeric d,1 h,false support,coalesce(array_position(array[''tiny'',''small'',''medium'',''large'',''huge''],t->>''sizeCategory''),least(5,greatest(3,ceil((t->>''size'')::numeric)::int+2))) size_rank
    from jsonb_array_elements(st.scene->''tokens'') t where t->>''roomId'' not in (object_id,coalesce(passenger_id,''''))
   union all
   select (t->>''x'')::numeric,(t->>''y'')::numeric,(t->>''z'')::numeric,
    case when coalesce((t->>''r'')::int,0)%2=1 then v.d else v.w end,
    case when coalesce((t->>''r'')::int,0)%2=1 then v.w else v.d end,v.h,true support,null::integer size_rank
   from jsonb_array_elements(st.scene->''pieces'') t join (values (''terrace'',3,2,1),(''stone'',2,2,2),(''wall'',3,1,2),(''pillar'',1,1,3),(''column'',.5,.5,3),(''bridge'',3,1,1),(''crate'',1,1,1),(''fountain'',1,1,1),(''stream'',3,1,0),(''waterfall'',2,1,2),(''volume'',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>''type''
   cross join lateral (select
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>2)::numeric,defaults.h) else defaults.h end h
   ) v
     ) q where q.h>0;','     select coalesce(jsonb_agg(to_jsonb(q)),''[]'') into occupied from (
   select (t->>''x'')::numeric x,(t->>''y'')::numeric y,(t->>''z'')::numeric z,(t->>''size'')::numeric w,(t->>''size'')::numeric d,1 h,false support,coalesce(array_position(array[''tiny'',''small'',''medium'',''large'',''huge''],t->>''sizeCategory''),least(5,greatest(3,ceil((t->>''size'')::numeric)::int+2))) size_rank
    from jsonb_array_elements(st.scene->''tokens'') t where t->>''roomId'' not in (object_id,coalesce(passenger_id,''''))
     and not coalesce(t->''conditions'' ? ''dead'',false)
     and not (coalesce(t->>''type'','''') in (''light'',''torch'',''spellLight'') or coalesce(t->>''shape'','''')=''light'' or coalesce(t->''terrainShape''->>''componentKind'','''')=''light'')
   union all
   select (t->>''x'')::numeric,(t->>''y'')::numeric,(t->>''z'')::numeric,
    case when coalesce((t->>''r'')::int,0)%2=1 then v.d else v.w end,
    case when coalesce((t->>''r'')::int,0)%2=1 then v.w else v.d end,v.h,true support,null::integer size_rank
   from jsonb_array_elements(st.scene->''pieces'') t join (values (''terrace'',3,2,1),(''stone'',2,2,2),(''wall'',3,1,2),(''pillar'',1,1,3),(''column'',.5,.5,3),(''bridge'',3,1,1),(''crate'',1,1,1),(''fountain'',1,1,1),(''stream'',3,1,0),(''waterfall'',2,1,2),(''volume'',2,2,1)) defaults(kind,w,d,h) on defaults.kind=t->>''type''
   cross join lateral (select
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>0)::numeric,defaults.w) else defaults.w end w,
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>1)::numeric,defaults.d) else defaults.d end d,
    case when defaults.kind=''volume'' then coalesce((t->''extents''->>2)::numeric,defaults.h) else defaults.h end h
   ) v
   where not (coalesce(t->>''type'','''') in (''light'',''torch'',''spellLight'') or coalesce(t->>''shape'','''')=''light'' or coalesce(t->''terrainShape''->>''componentKind'','''')=''light'')
     ) q where q.h>0;');
  if (length(definition)-length(replace(definition,'declare px numeric; py numeric; pz numeric; size numeric; radius numeric; new_id text; result jsonb; pref text;','')))/length('declare px numeric; py numeric; pz numeric; size numeric; radius numeric; new_id text; result jsonb; pref text;')<>1 then raise exception 'Dimension Door source changed in %; review patch',fn; end if;
  definition:=replace(definition,'declare px numeric; py numeric; pz numeric; size numeric; radius numeric; new_id text; result jsonb; pref text;','declare px numeric; py numeric; pz numeric; size numeric; radius numeric; new_id text; result jsonb; pref text; map_width numeric:=40; map_depth numeric:=40; scene_grid jsonb;');
  if (length(definition)-length(replace(definition,'   radius:=case action when ''dimension_door'' then 100 when ''arcane_eye'' then 6 when ''arcane_eye_move'' then 60 else 2 end;','')))/length('   radius:=case action when ''dimension_door'' then 100 when ''arcane_eye'' then 6 when ''arcane_eye_move'' then 60 else 2 end;')<>1 then raise exception 'Dimension Door source changed in %; review patch',fn; end if;
  definition:=replace(definition,'   radius:=case action when ''dimension_door'' then 100 when ''arcane_eye'' then 6 when ''arcane_eye_move'' then 60 else 2 end;','   radius:=case action when ''dimension_door'' then 100 when ''arcane_eye'' then 6 when ''arcane_eye_move'' then 60 else 2 end;
   -- Dimension Door uses the same scene bounds as its targeting marker.
   if action=''dimension_door'' then
    select a->''grid'' into scene_grid from jsonb_array_elements(coalesce(st.scene->''areas'',''[]''::jsonb)) a where a->>''shape''=''appearance'' limit 1;
    if jsonb_typeof(scene_grid->''width'')=''number'' and jsonb_typeof(scene_grid->''depth'')=''number'' then
     if (scene_grid->>''width'')::numeric between 10 and 100 and (scene_grid->>''depth'')::numeric between 10 and 100
      and trunc((scene_grid->>''width'')::numeric)=(scene_grid->>''width'')::numeric
      and trunc((scene_grid->>''depth'')::numeric)=(scene_grid->>''depth'')::numeric then
      map_width:=(scene_grid->>''width'')::numeric;map_depth:=(scene_grid->>''depth'')::numeric;
     end if;
    end if;
   end if;');
  if (length(definition)-length(replace(definition,'if px not between 0 and 40 or py not between 0 and 40 or pz','')))/length('if px not between 0 and 40 or py not between 0 and 40 or pz')<>1 then raise exception 'Dimension Door source changed in %; review patch',fn; end if;
  definition:=replace(definition,'if px not between 0 and 40 or py not between 0 and 40 or pz','if px not between 0 and map_width or py not between 0 and map_depth or pz');
  if (length(definition)-length(replace(definition,'c.x between 0 and 40-width and c.y between 0 and 40-width','')))/length('c.x between 0 and 40-width and c.y between 0 and 40-width')<>2 then raise exception 'Dimension Door source changed in %; review patch',fn; end if;
  definition:=replace(definition,'c.x between 0 and 40-width and c.y between 0 and 40-width','c.x between 0 and map_width-width and c.y between 0 and map_depth-width');
  if (length(definition)-length(replace(definition,'generate_series(0,40-width,1) gx cross join generate_series(0,40-width,1) gy','')))/length('generate_series(0,40-width,1) gx cross join generate_series(0,40-width,1) gy')<>1 then raise exception 'Dimension Door source changed in %; review patch',fn; end if;
  definition:=replace(definition,'generate_series(0,40-width,1) gx cross join generate_series(0,40-width,1) gy','generate_series(0,map_width-width,1) gx cross join generate_series(0,map_depth-width,1) gy');
  execute definition;
 end loop;
end $migration$;
