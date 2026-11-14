-- Only ciphertext is uploaded. Paths have no original filename and are never public.
CREATE TABLE public.whisper_chat_uploads (
 path text PRIMARY KEY DEFAULT replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 room text NOT NULL, member_hash text NOT NULL, nonce text NOT NULL,
 bytes integer NOT NULL CHECK(bytes BETWEEN 17 AND 262160), digest text NOT NULL, iv text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','deleting')),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
 retry_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX whisper_chat_uploads_room ON public.whisper_chat_uploads(room);
CREATE INDEX whisper_chat_messages_storage_ref ON public.whisper_chat_messages(file) WHERE file LIKE '@storage/%';
ALTER TABLE public.whisper_chat_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whisper_chat_uploads FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.hush_chat_api(text,jsonb) RENAME TO hush_chat_api_before_storage;
REVOKE ALL ON FUNCTION public.hush_chat_api_before_storage(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.hush_chat_api(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 p alias for payload; result jsonb; r public.whisper_rooms; u public.whisper_chat_uploads;
 room_id text:=p->>'id'; member text:=p->>'member_hash'; existing integer; used bigint;
BEGIN
 IF action='chat_upload' OR (action='chat_send' AND p->>'file' LIKE '@storage/%') THEN
  SELECT * INTO r FROM public.whisper_rooms WHERE id=room_id FOR UPDATE;
  -- Reuse the complete authorization and abuse-budget path before reserving/uploading.
  result:=public.hush_chat_api_before_storage('chat_sync',p||jsonb_build_object('seen',0,'typing',false));
  IF (result->>'status')::integer<>200 THEN RETURN result; END IF;
  SELECT seq INTO existing FROM public.whisper_chat_messages WHERE room=room_id AND member_hash=member AND nonce=p->>'nonce';
  IF FOUND THEN RETURN jsonb_build_object('status',200,'body',jsonb_build_object('seq',existing)); END IF;
  IF r.mode='total' AND r.sent>=r.max_messages THEN RETURN jsonb_build_object('status',409,'body',jsonb_build_object('code','messageLimit')); END IF;
  IF action='chat_upload' THEN
   IF coalesce(p->>'digest','') !~ '^[a-f0-9]{64}$' OR coalesce(p->>'nonce','') !~ '^\w{32}$'
    OR coalesce(p->>'bytes','') !~ '^[0-9]{2,6}$' OR (p->>'bytes')::integer NOT BETWEEN 17 AND 262160
    OR coalesce(p->>'file_iv','') !~ '^[A-Za-z0-9_-]{16}$' THEN
    RETURN jsonb_build_object('status',400,'body',jsonb_build_object('code','invalid'));
   END IF;
   IF NOT public.hush_take_budget('chat:upload:'||room_id||':'||member,20,60) THEN
    RETURN jsonb_build_object('status',429,'body',jsonb_build_object('code','rateLimit'));
   END IF;
   -- Count pending files too: abandoned uploads cannot bypass per-room quotas.
   SELECT coalesce(sum(bytes),0) INTO used FROM public.whisper_chat_uploads WHERE room=room_id;
   IF used+(p->>'bytes')::integer+octet_length(p->>'ciphertext')+(SELECT coalesce(sum(octet_length(ciphertext)+CASE WHEN file LIKE '@storage/%' THEN 0 ELSE coalesce(octet_length(file),0) END),0) FROM public.whisper_chat_messages WHERE room=room_id)>2097152
    OR (SELECT count(*) FROM public.whisper_chat_uploads WHERE room=room_id AND state='pending')>=4 THEN
    RETURN jsonb_build_object('status',413,'body',jsonb_build_object('code','storageLimit'));
   END IF;
   INSERT INTO public.whisper_chat_uploads(room,member_hash,nonce,bytes,digest,iv)
    VALUES(room_id,member,p->>'nonce',(p->>'bytes')::integer,p->>'digest',p->>'file_iv') RETURNING * INTO u;
   RETURN jsonb_build_object('status',201,'body',jsonb_build_object('path',u.path));
  END IF;
  SELECT * INTO u FROM public.whisper_chat_uploads WHERE path=substring(p->>'file' FROM 10) FOR UPDATE;
  IF u.path IS NULL OR u.room<>room_id OR u.member_hash<>member OR u.nonce<>p->>'nonce'
   OR u.iv<>p->>'file_iv' OR u.state<>'pending' OR u.expires_at<=clock_timestamp() THEN
   RETURN jsonb_build_object('status',400,'body',jsonb_build_object('code','invalid'));
  END IF;
  result:=public.hush_chat_api_before_storage(action,p);
  IF (result->>'status')::integer BETWEEN 200 AND 299 THEN UPDATE public.whisper_chat_uploads SET state='sent' WHERE path=u.path; END IF;
  RETURN result;
 END IF;
 RETURN public.hush_chat_api_before_storage(action,p);
END;
$$;
REVOKE ALL ON FUNCTION public.hush_chat_api(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hush_chat_api(text,jsonb) TO service_role;

-- Keep existing independent local PostgreSQL tests free of Supabase platform schemas.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('whisper-chat-files','whisper-chat-files',false,262160,ARRAY['application/octet-stream'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=262160,allowed_mime_types=ARRAY['application/octet-stream'];
-- A future generic permissive policy must not accidentally expose this bucket.
CREATE POLICY whisper_chat_files_server_only ON storage.objects AS RESTRICTIVE
 FOR ALL TO anon,authenticated USING(bucket_id<>'whisper-chat-files') WITH CHECK(bucket_id<>'whisper-chat-files');
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- Independent cron authentication: generated inside Vault, never sent to the browser or Git.
SELECT vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'whisper_storage_gc_token')
 WHERE NOT EXISTS(SELECT FROM vault.secrets WHERE name='whisper_storage_gc_token');
CREATE FUNCTION public.hush_storage_gc(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE paths jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM vault.decrypted_secrets WHERE name='whisper_storage_gc_token' AND decrypted_secret=payload->>'token') THEN
  RETURN jsonb_build_object('status',403,'body',jsonb_build_object('code','denied'));
 END IF;
 IF action='storage_gc_claim' THEN
  WITH candidates AS (
   SELECT u.path FROM public.whisper_chat_uploads u WHERE u.retry_at<=clock_timestamp() AND
    ((u.state IN ('pending','deleting') AND u.expires_at<clock_timestamp()) OR (u.state='sent' AND NOT EXISTS(
     SELECT FROM public.whisper_chat_messages m JOIN public.whisper_rooms r ON r.id=m.room
      WHERE m.file='@storage/'||u.path AND r.expires_at>clock_timestamp())))
   ORDER BY u.retry_at LIMIT 100 FOR UPDATE OF u SKIP LOCKED
  ), claimed AS (
   UPDATE public.whisper_chat_uploads u SET state='deleting',expires_at=clock_timestamp()+interval '1 minute',retry_at=clock_timestamp()+interval '1 minute'
    FROM candidates c WHERE u.path=c.path RETURNING u.path
  ) SELECT coalesce(jsonb_agg(path),'[]'::jsonb) INTO paths FROM claimed;
  RETURN jsonb_build_object('status',200,'body',jsonb_build_object('paths',paths));
 ELSIF action='storage_gc_ack' THEN
  DELETE FROM public.whisper_chat_uploads WHERE state='deleting' AND path IN (SELECT jsonb_array_elements_text(payload->'paths'));
  RETURN jsonb_build_object('status',200,'body',jsonb_build_object('ok',true));
 END IF;
 RETURN jsonb_build_object('status',400,'body',jsonb_build_object('code','invalid'));
END;
$$;
REVOKE ALL ON FUNCTION public.hush_storage_gc(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hush_storage_gc(text,jsonb) TO service_role;
SELECT cron.schedule('whisper-storage-cleanup','* * * * *', $job$
 SELECT net.http_post(
  url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='whisper_storage_gc_url'),
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='whisper_storage_gc_token')),
  timeout_milliseconds:=20000
 ) WHERE EXISTS(SELECT FROM vault.decrypted_secrets WHERE name='whisper_storage_gc_url');
$job$);
