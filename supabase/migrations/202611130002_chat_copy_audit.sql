-- Copy notices are host-only at the RPC boundary, never filtered solely in the UI.
ALTER TABLE public.whisper_room_events DROP CONSTRAINT whisper_room_events_kind_check;
ALTER TABLE public.whisper_room_events ADD CONSTRAINT whisper_room_events_kind_check CHECK(kind IN ('joined','left','capture_shortcut','copied'));
ALTER TABLE public.whisper_room_events ADD COLUMN seq integer CHECK(seq BETWEEN 1 AND 1000000);
CREATE OR REPLACE FUNCTION public.hush_chat_api(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 p alias for payload; result jsonb; prior public.whisper_members;
 room_id text:=p->>'id'; member text:=p->>'member_hash'; event_kind text; events jsonb; people jsonb; copied_seq integer;
BEGIN
 IF action IN ('chat_sync','chat_presence','chat_capture') AND p ? 'focused' AND jsonb_typeof(p->'focused')<>'boolean' THEN
  RETURN jsonb_build_object('status',400,'body',jsonb_build_object('code','invalid'));
 END IF;
 -- Serialize the membership snapshot with the core join/leave operation.
 PERFORM 1 FROM public.whisper_rooms WHERE id=room_id FOR UPDATE;
 SELECT * INTO prior FROM public.whisper_members WHERE room=room_id AND member_hash=member;
 result:=public.hush_chat_api_core(CASE WHEN action IN ('chat_presence','chat_capture','chat_copy') THEN 'chat_sync' ELSE action END,
  CASE WHEN action IN ('chat_presence','chat_capture','chat_copy') THEN p||jsonb_build_object('seen',0,'typing',false) ELSE p END);
 IF (result->>'status')::integer NOT BETWEEN 200 AND 299 THEN RETURN result; END IF;
 IF action IN ('chat_sync','chat_presence','chat_capture') THEN
  UPDATE public.whisper_members SET focused=coalesce((p->>'focused')::boolean,true)
   WHERE room=room_id AND member_hash=member;
 END IF;
 IF action='chat_create' OR (action='chat_join' AND prior.member_hash IS NULL) THEN event_kind:='joined';
 ELSIF action='chat_leave' AND NOT prior.host THEN event_kind:='left';
 ELSIF action='chat_copy' THEN
  IF p->>'seq' IS NOT NULL THEN
   IF jsonb_typeof(p->'seq')<>'number' OR p->>'seq' !~ '^[0-9]{1,7}$' THEN
    RETURN jsonb_build_object('status',400,'body',jsonb_build_object('code','invalid'));
   END IF;
   copied_seq:=(p->>'seq')::integer;
   IF NOT EXISTS(SELECT 1 FROM public.whisper_chat_messages WHERE room=room_id AND seq=copied_seq) THEN
    RETURN jsonb_build_object('status',404,'body',jsonb_build_object('code','messageGone'));
   END IF;
  END IF;
  IF NOT public.hush_take_budget('chat:copy:'||room_id||':'||member,20,60) THEN
   RETURN jsonb_build_object('status',429,'body',jsonb_build_object('code','rateLimit'));
  END IF;
  IF EXISTS(SELECT 1 FROM public.whisper_room_events WHERE room=room_id AND member_id=left(member,16)
   AND kind='copied' AND seq IS NOT DISTINCT FROM copied_seq AND happened_at>clock_timestamp()-interval '1 second') THEN
   RETURN jsonb_build_object('status',200,'body',jsonb_build_object('ok',true));
  END IF;
  event_kind:='copied';
 ELSIF action='chat_capture' THEN
  -- This is a client-reported shortcut, NOT proof that a screenshot was taken.
  IF NOT public.hush_take_budget('chat:capture:'||room_id||':'||member,1,30) THEN
   RETURN jsonb_build_object('status',429,'body',jsonb_build_object('code','rateLimit'));
  END IF;
  event_kind:='capture_shortcut';
 END IF;
 IF event_kind IS NOT NULL THEN
  INSERT INTO public.whisper_room_events(room,member_id,name,kind,seq)
   VALUES(room_id,left(member,16),coalesce(prior.name,p->>'name'),event_kind,copied_seq);
  DELETE FROM public.whisper_room_events WHERE room=room_id AND (kind='copied')=(event_kind='copied') AND id NOT IN
   (SELECT id FROM public.whisper_room_events WHERE room=room_id AND (kind='copied')=(event_kind='copied') ORDER BY id DESC LIMIT 100);
 END IF;
 IF action='chat_sync' THEN
  SELECT coalesce(jsonb_agg(person||jsonb_build_object('focused',m.focused) ORDER BY m.host DESC,m.name),'[]'::jsonb)
   INTO people FROM jsonb_array_elements(result->'body'->'members') person
   JOIN public.whisper_members m ON m.room=room_id AND left(m.member_hash,16)=person->>'id';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'member',member_id,'name',name,'kind',kind,'at',happened_at,'seq',seq) ORDER BY id),'[]'::jsonb)
   INTO events FROM public.whisper_room_events WHERE room=room_id AND (kind<>'copied' OR prior.host);
  result:=jsonb_set(result,'{body}',(result->'body')||jsonb_build_object('members',people,'events',events));
 ELSIF action IN ('chat_presence','chat_capture','chat_copy') THEN
  RETURN jsonb_build_object('status',200,'body',jsonb_build_object('ok',true));
 END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.hush_chat_api(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hush_chat_api(text,jsonb) TO service_role;
