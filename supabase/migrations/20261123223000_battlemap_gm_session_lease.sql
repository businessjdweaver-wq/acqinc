-- Keep GM authorization valid through temporary browser or computer sleep.
-- The client still enforces its 30-minute inactivity timeout. A 35-minute
-- server lease gives a short grace window for the next heartbeat after wake.
DO $migration$
DECLARE
 definition text;
 routine record;
BEGIN
 FOR routine IN
  SELECT p.oid,n.nspname,p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind='f'
   AND n.nspname IN ('public','battlemap_room')
   AND (
    pg_get_functiondef(p.oid) LIKE '%heartbeat<now()-interval ''65 seconds''%'
    OR (
     p.proname IN (
      'viewer','scene_viewer','battlemap_room_gm_login',
      'battlemap_room_gm_login_named','battlemap_room_legacy_login'
     )
     AND pg_get_functiondef(p.oid) LIKE '%heartbeat>now()-interval ''65 seconds''%'
    )
   )
 LOOP
  definition:=pg_get_functiondef(routine.oid);
  definition:=replace(
   definition,
   'heartbeat<now()-interval ''65 seconds''',
   'heartbeat<now()-interval ''35 minutes'''
  );
  IF routine.proname IN (
   'viewer','scene_viewer','battlemap_room_gm_login',
   'battlemap_room_gm_login_named','battlemap_room_legacy_login'
  ) THEN
   definition:=replace(
    definition,
    'heartbeat>now()-interval ''65 seconds''',
    'heartbeat>now()-interval ''35 minutes'''
   );
  END IF;
  EXECUTE definition;
 END LOOP;
END
$migration$;
