-- Server-reported file retrieval, public to the room; never stores a plaintext filename.
ALTER TABLE public.whisper_room_events DROP CONSTRAINT whisper_room_events_kind_check;
ALTER TABLE public.whisper_room_events ADD CONSTRAINT whisper_room_events_kind_check CHECK(kind IN ('joined','left','capture_shortcut','copied','downloaded'));
ALTER FUNCTION public.hush_chat_api(text,jsonb) RENAME TO hush_chat_api_before_download;
REVOKE ALL ON FUNCTION public.hush_chat_api_before_download(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.hush_chat_api(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; actor public.whisper_members; target integer;
BEGIN
 IF action<>'chat_download' THEN RETURN public.hush_chat_api_before_download(action,payload); END IF;
 -- Called only by the server AFTER retrieving ciphertext. Recheck the message and room
 -- under the same room lock used by deletion/expiry, rather than trusting a client report.
 PERFORM 1 FROM public.whisper_rooms WHERE id=payload->>'id' FOR UPDATE;
 result:=public.hush_chat_api_before_download('chat_file',payload);
 IF (result->>'status')::integer<>200 THEN RETURN result; END IF;
 IF result->'body'->>'file' IS NULL THEN RETURN jsonb_build_object('status',404,'body',jsonb_build_object('code','messageGone')); END IF;
 target:=(payload->>'seq')::integer;
 SELECT * INTO actor FROM public.whisper_members WHERE room=payload->>'id' AND member_hash=payload->>'member_hash';
 IF NOT EXISTS(SELECT FROM public.whisper_room_events WHERE room=actor.room AND member_id=left(actor.member_hash,16)
  AND kind='downloaded' AND seq=target AND happened_at>clock_timestamp()-interval '1 second') THEN
  IF NOT public.hush_take_budget('chat:download:'||actor.room||':'||actor.member_hash,20,60) THEN
   RETURN jsonb_build_object('status',429,'body',jsonb_build_object('code','rateLimit'));
  END IF;
  INSERT INTO public.whisper_room_events(room,member_id,name,kind,seq) VALUES(actor.room,left(actor.member_hash,16),actor.name,'downloaded',target);
  -- Public checkpoints share their existing bounded history. Private copy events stay separate.
  DELETE FROM public.whisper_room_events WHERE room=actor.room AND kind<>'copied' AND id NOT IN
   (SELECT id FROM public.whisper_room_events WHERE room=actor.room AND kind<>'copied' ORDER BY id DESC LIMIT 100);
 END IF;
 RETURN jsonb_build_object('status',200,'body',jsonb_build_object('ok',true));
END;
$$;
REVOKE ALL ON FUNCTION public.hush_chat_api(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hush_chat_api(text,jsonb) TO service_role;
