-- Use the canonical encounter for DM editing, testing, and live play.
ALTER TABLE battlemap_room.scene_lifecycle ADD COLUMN IF NOT EXISTS shared_scene_id text;

-- Preserve old preview work where no canonical encounter has been created.
-- If both already exist, the canonical encounter remains authoritative.
WITH migrated AS (
  INSERT INTO battlemap_room.encounters(scene_id,scene,title,paused,revision,initiative)
  SELECT substr(p.scene_id,14),p.scene,p.title,p.paused,p.revision,p.initiative
  FROM battlemap_room.encounters p
  WHERE p.test_preview AND p.scene_id LIKE 'test-preview:%'
    AND EXISTS (SELECT 1 FROM battlemap_room.gm_workspace w
      CROSS JOIN LATERAL jsonb_array_elements(w.value) AS item
      WHERE w.key='battlemap.scenes.v1' AND item->>'id'=substr(p.scene_id,14))
  ON CONFLICT(scene_id) DO NOTHING
  RETURNING scene_id
)
UPDATE battlemap_room.scene_lifecycle
SET shared_scene_id=(SELECT min(scene_id) FROM migrated)
WHERE singleton AND shared_scene_id IS NULL AND (SELECT count(*) FROM migrated)=1;

CREATE OR REPLACE FUNCTION public.battlemap_scene_test_open(ticket uuid, requested_scene text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  actor text;
  active_id text;
  source_scene jsonb;
  source_title text;
  focused_id text;
  is_gm boolean := battlemap_room.scene_viewer(ticket, NULL) IS NOT DISTINCT FROM 'gm';
BEGIN
  SELECT a.profile INTO actor
  FROM battlemap_room.players a
  JOIN battlemap_room.profiles p ON p.name=a.profile
  WHERE a.token=ticket AND p.approved AND p.can_test AND p.password_hash IS NOT NULL;
  IF actor IS NULL AND NOT is_gm THEN
    RETURN jsonb_build_object('error','Test-scene access is required.');
  END IF;

  SELECT active_scene_id,shared_scene_id INTO active_id,focused_id
  FROM battlemap_room.scene_lifecycle WHERE singleton;

  IF NOT is_gm THEN
    requested_scene:=coalesce(focused_id,active_id);
    RETURN jsonb_build_object('sceneId',requested_scene,'testPreview',
      requested_scene IS NOT NULL AND requested_scene IS DISTINCT FROM active_id);
  END IF;

  SELECT active_scene_id INTO active_id
  FROM battlemap_room.scene_lifecycle WHERE singleton FOR UPDATE;

  IF EXISTS (SELECT 1 FROM battlemap_room.encounters e WHERE e.scene_id=requested_scene
             AND NOT e.test_preview) THEN
    UPDATE battlemap_room.scene_lifecycle SET shared_scene_id=requested_scene
    WHERE singleton AND shared_scene_id IS DISTINCT FROM requested_scene;
    IF FOUND THEN PERFORM battlemap_room.emit('status','{}'::jsonb); END IF;
    RETURN jsonb_build_object('sceneId',requested_scene,'testPreview',requested_scene IS DISTINCT FROM active_id);
  END IF;

  SELECT item->'map',
         coalesce(item->>'name','Battlemap')
  INTO source_scene,source_title
  FROM battlemap_room.gm_workspace w
  CROSS JOIN LATERAL jsonb_array_elements(w.value) item
  WHERE w.key='battlemap.scenes.v1' AND item->>'id'=requested_scene
  LIMIT 1;
  IF source_scene IS NULL OR requested_scene IS NULL THEN
    RETURN jsonb_build_object('error','That saved scene is unavailable for testing.');
  END IF;

  IF pg_column_size(source_scene)>12000000 THEN
    RETURN jsonb_build_object('error','Scene is larger than 12 MB.');
  END IF;

  INSERT INTO battlemap_room.controllers(profile,standee_id,character_name)
  SELECT inherited.profile,token->>'roomId',inherited.character_name
  FROM jsonb_array_elements(coalesce(source_scene->'tokens','[]'::jsonb)) AS tokens(token)
  JOIN LATERAL (
    SELECT link.id
    FROM (VALUES (nullif(token->>'ownerStandeeId',''),1),
                 (nullif(token->>'characterRoomId',''),2)) AS link(id,priority)
    WHERE link.id IS NOT NULL
      AND EXISTS (SELECT 1 FROM battlemap_room.controllers c WHERE c.standee_id=link.id)
    ORDER BY link.priority
    LIMIT 1
  ) chosen ON true
  JOIN battlemap_room.controllers inherited ON inherited.standee_id=chosen.id
  JOIN battlemap_room.profiles assigned_profile
    ON assigned_profile.name=inherited.profile AND assigned_profile.approved
  WHERE token->>'type'='standee'
    AND nullif(token->>'roomId','') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM battlemap_room.controllers existing
      WHERE existing.standee_id=token->>'roomId'
    )
  ON CONFLICT(profile,standee_id) DO NOTHING;

  -- Store the same shared fields as the regular encounter. Sync projects
  -- this snapshot for players, while the GM can see hidden objects.
  WITH objects AS (
    SELECT bucket, item, ord, row_number() OVER (
      PARTITION BY bucket,item->>'roomId' ORDER BY ord
    ) AS occurrence
    FROM (VALUES ('pieces'),('tokens'),('areas')) AS buckets(bucket)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(source_scene->bucket,'[]'::jsonb))
      WITH ORDINALITY AS items(item,ord)
    WHERE bucket<>'areas' OR (item->>'shape' IS DISTINCT FROM 'journal'
      AND (item->>'shape'='light' AND item->'secret'='true'::jsonb) IS NOT TRUE)
  ), normalized AS (
    SELECT bucket,jsonb_agg(
      (CASE WHEN bucket='tokens' THEN item-ARRAY['plannerMonster','plannerCombat','ddbMonsterSource']
            ELSE item END)
      || CASE WHEN nullif(item->>'roomId','') IS NULL OR occurrence>1
              THEN jsonb_build_object('roomId',md5(jsonb_build_array(requested_scene,bucket,ord)::text)::uuid::text)
              ELSE '{}'::jsonb END
      ORDER BY ord
    ) AS items
    FROM objects GROUP BY bucket
  )
  SELECT jsonb_build_object('pieces','[]'::jsonb,'tokens','[]'::jsonb,'areas','[]'::jsonb)
    || coalesce(jsonb_object_agg(bucket,items),'{}'::jsonb)
  INTO source_scene FROM normalized;
  INSERT INTO battlemap_room.encounters(scene_id,scene,title,paused)
  VALUES(requested_scene,source_scene,left(source_title,80),true)
  ON CONFLICT(scene_id) DO NOTHING;

  UPDATE battlemap_room.scene_lifecycle SET shared_scene_id=requested_scene
  WHERE singleton AND shared_scene_id IS DISTINCT FROM requested_scene;
  IF FOUND THEN PERFORM battlemap_room.emit('status','{}'::jsonb); END IF;
  RETURN jsonb_build_object('sceneId',requested_scene,'testPreview',requested_scene IS DISTINCT FROM active_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.battlemap_scene_test_open(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.battlemap_scene_test_open(uuid,text) TO anon,authenticated;


-- Keep the original snapshot and visibility rules. The wrapper only chooses
-- the server scene for an authorized DM or tester, including older clients.
ALTER FUNCTION public.battlemap_scene_sync(uuid,text,bigint,boolean) SET SCHEMA battlemap_room;
REVOKE ALL ON FUNCTION battlemap_room.battlemap_scene_sync(uuid,text,bigint,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.battlemap_scene_sync(ticket uuid, requested_scene text DEFAULT NULL,
  since_event bigint DEFAULT -1, snapshot boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  focused text;
  is_gm boolean := battlemap_room.scene_viewer(ticket,NULL) IS NOT DISTINCT FROM 'gm';
  follows_dm boolean;
  result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM battlemap_room.players a JOIN battlemap_room.profiles p ON p.name=a.profile
    WHERE a.token=ticket AND p.approved AND p.can_test AND p.password_hash IS NOT NULL
  ) INTO follows_dm;
  IF is_gm OR follows_dm THEN
    SELECT coalesce(e.scene_id,l.active_scene_id) INTO focused
    FROM battlemap_room.scene_lifecycle l
    LEFT JOIN battlemap_room.encounters e ON e.scene_id=l.shared_scene_id AND NOT e.test_preview
    WHERE l.singleton;
    result:=battlemap_room.battlemap_scene_sync(ticket,focused,
      CASE WHEN requested_scene IS DISTINCT FROM focused THEN -1 ELSE since_event END,snapshot);
    RETURN result||jsonb_build_object('followsDm',follows_dm,'canBrowseScenes',false);
  END IF;
  RETURN battlemap_room.battlemap_scene_sync(ticket,requested_scene,since_event,snapshot);
END;
$function$;
REVOKE ALL ON FUNCTION public.battlemap_scene_sync(uuid,text,bigint,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.battlemap_scene_sync(uuid,text,bigint,boolean) TO anon,authenticated;
