-- Keep the longer timeout limited to the one RPC that persists the shared
-- scene catalog. The previous migration raised the authenticator timeout for
-- every API request, but anonymous scene saves use the anon role's limit.
ALTER ROLE authenticator SET statement_timeout = '8s';
ALTER FUNCTION public.battlemap_room_workspace(uuid,text,jsonb,bigint)
  S