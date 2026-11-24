-- Give the GM and test accounts a shared preview for every inactive saved scene without
-- changing the saved scene or the active encounter.
ALTER TABLE battlemap_room.encounters
  ADD COLUMN IF NOT EXISTS test_preview boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_source_hash text;

CREATE OR REPLACE FUNCTION public.battlemap_scene_test_open(ticket uuid, requested_scene text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  actor text;
  active_id text;
  preview_id text;
  source_scene jsonb;
  source_title text;
  source_hash text;
  is_gm boolean := battlemap_room.scene_viewer(ticket, NULL) IS NOT DISTINCT FROM 'gm';
BEGIN
  SELECT a.profile INTO actor
  FROM battlemap_room.players a
  JOIN battlemap_room.profiles p ON p.name=a.profile
  WHERE a.token=ticket AND p.approved AND p.can_test AND p.password_hash IS NOT NULL;
  IF actor IS NULL AND NOT is_gm THEN
    RETURN jsonb_build_object('error','Test-scene access is required.');
  END IF;

  SELECT active_scene_id INTO active_id
  FROM battlemap_room.scene_lifecycle
  WHERE singleton;

  -- The published active scene is the live encounter. Test previews are for
  -- saved scenes that have not been activated.
  IF requested_scene IS NOT NULL AND requested_scene=active_id THEN
    RETURN jsonb_build_object('sceneId',requested_scene,'testPreview',false);
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

  preview_id:='test-preview:'||requested_scene;

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
              THEN jsonb_build_object('roomId',md5(jsonb_build_array(preview_id,bucket,ord)::text)::uuid::text)
              ELSE '{}'::jsonb END
      ORDER BY ord
    ) AS items
    FROM objects GROUP BY bucket
  )
  SELECT jsonb_build_object('pieces','[]'::jsonb,'tokens','[]'::jsonb,'areas','[]'::jsonb)
    || coalesce(jsonb_object_agg(bucket,items),'{}'::jsonb)
  INTO source_scene FROM normalized;
  source_hash:=md5(source_scene::text);

  INSERT INTO battlemap_room.encounters AS existing
    (scene_id,scene,title,paused,test_preview,test_source_hash)
  VALUES
    (preview_id,source_scene,left(source_title,80),true,true,source_hash)
  ON CONFLICT(scene_id) DO UPDATE SET
    scene=CASE WHEN existing.test_preview
                    AND existing.test_source_hash IS DISTINCT FROM EXCLUDED.test_source_hash
               THEN EXCLUDED.scene ELSE existing.scene END,
    title=EXCLUDED.title,
    revision=CASE WHEN existing.test_preview
                       AND existing.test_source_hash IS DISTINCT FROM EXCLUDED.test_source_hash
                  THEN existing.revision+1 ELSE existing.revision END,
    paused=true,
    test_preview=true,
    test_source_hash=EXCLUDED.test_source_hash
  WHERE existing.test_preview
    AND (existing.test_source_hash IS DISTINCT FROM EXCLUDED.test_source_hash
      OR existing.title IS DISTINCT FROM EXCLUDED.title);

  IF NOT EXISTS (SELECT 1 FROM battlemap_room.encounters e
                 WHERE e.scene_id=preview_id AND e.test_preview) THEN
    RETURN jsonb_build_object('error','Could not open the test preview.');
  END IF;

  RETURN jsonb_build_object('sceneId',preview_id,'testPreview',true,'title',left(source_title,80));
END;
$function$;

REVOKE ALL ON FUNCTION public.battlemap_scene_test_open(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.battlemap_scene_test_open(uuid,text) TO anon,authenticated;
