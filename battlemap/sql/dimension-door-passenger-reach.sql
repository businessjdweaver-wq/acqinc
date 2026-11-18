-- Resolve the caster first, then constrain the passenger to 5-foot melee reach.
-- Both customizers commit the resulting positions together.
do $migration$
declare
 fn text;
 definition text;
 bounds constant text := 'where c.x between 0 and map_width-width and c.y between 0 and map_depth-width and c.z between 0 and 11';
 reach constant text := $reach$
      and (tid=object_id or greatest(
       c.x-(arrivals->object_id->>'x')::numeric-size,
       (arrivals->object_id->>'x')::numeric-c.x-width,
       c.y-(arrivals->object_id->>'y')::numeric-size,
       (arrivals->object_id->>'y')::numeric-c.y-width,
       abs(c.z-(arrivals->object_id->>'z')::numeric)-1
      )<=0.000001)$reach$;
 travelers constant text := 'for traveller in select obj union all select passenger where passenger is not null loop';
 search_start constant text := 'select gx,gy,gz from generate_series(0,map_width-width,1) gx';
 no_destination constant text := 'if destination is null then return jsonb_build_object(''error'',''No open arrival square was found.''); end if;';
begin
 foreach fn in array array['battlemap_room_customize','battlemap_scene_customize'] loop
  select pg_get_functiondef(p.oid) into strict definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=fn;
  if strpos(definition,reach)>0 then continue; end if;
  if (length(definition)-length(replace(definition,bounds,'')))<>2*length(bounds)
   or (length(definition)-length(replace(definition,travelers,'')))<>length(travelers)
   or (length(definition)-length(replace(definition,search_start,'')))<>length(search_start)
   or (length(definition)-length(replace(definition,no_destination,'')))<>length(no_destination)
  then raise exception 'Review Dimension Door source in %',fn; end if;
  definition:=replace(definition,travelers,
   'for traveller in select t from (values (0,obj),(1,passenger)) travelers(priority,t) where t is not null order by priority loop');
  definition:=replace(definition,bounds,bounds||reach);
  definition:=replace(definition,search_start,$candidates$
       select (arrivals->object_id->>'x')::numeric+dx-px,
              (arrivals->object_id->>'y')::numeric+dy-py,
              (arrivals->object_id->>'z')::numeric+dz-pz
       where tid<>object_id
       union
       select gx,gy,gz
       from generate_series((arrivals->object_id->>'x')::numeric-width,(arrivals->object_id->>'x')::numeric+size,1) gx
       cross join generate_series((arrivals->object_id->>'y')::numeric-width,(arrivals->object_id->>'y')::numeric+size,1) gy
       cross join generate_series((arrivals->object_id->>'z')::numeric-1,(arrivals->object_id->>'z')::numeric+1,1) gz
       where tid<>object_id
       union
       $candidates$||search_start);
  definition:=replace(definition,no_destination,$error$
      if destination is null then
       return jsonb_build_object('error',case when tid=object_id then 'No open arrival square was found.'
        else 'No open arrival space within melee reach of the caster. Choose another destination.' end);
      end if;$error$);
  execute definition;
 end loop;
end
$migration$;
