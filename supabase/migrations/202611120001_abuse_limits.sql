-- Limits are enforced in PostgreSQL, across replicas/cold starts. Never persist raw IPs.
ALTER TABLE public.hush_messages ADD COLUMN owner_hash text;
CREATE INDEX hush_owner_active ON public.hush_messages(owner_hash,expires_at);
ALTER TABLE public.hush_challenges ADD COLUMN owner_hash text;
CREATE TABLE public.hush_abuse_budgets(key text PRIMARY KEY,used integer NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX hush_abuse_expiry ON public.hush_abuse_budgets(expires_at);
ALTER TABLE public.hush_abuse_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hush_abuse_budgets FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.hush_take_budget(k text,cap integer,seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 INSERT INTO public.hush_abuse_budgets AS b VALUES(k,1,to_timestamp((floor(extract(epoch FROM clock_timestamp())/seconds)+1)*seconds))
 ON CONFLICT(key) DO UPDATE SET
  used=CASE WHEN b.expires_at<=clock_timestamp() THEN 1 ELSE least(b.used+1,cap+1) END,
  expires_at=CASE WHEN b.expires_at<=clock_timestamp() THEN excluded.expires_at ELSE b.expires_at END
 RETURNING used INTO n;
 RETURN n<=cap;
END;
$$;
REVOKE ALL ON FUNCTION public.hush_take_budget(text,integer,integer) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.hush_api(text,jsonb) RENAME TO hush_api_core;
CREATE FUNCTION public.hush_api(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 owner text:=payload->>'owner_hash';
 network text:=payload->>'network_hash';
 r jsonb;
 epoch bigint:=floor(extract(epoch FROM clock_timestamp()));
BEGIN
 IF action IN ('guard','music_guard','create','challenge') AND
   (coalesce(owner,'') !~ '^[a-f0-9]{64}$' OR coalesce(network,'') !~ '^[a-f0-9]{64}$') THEN
  RETURN jsonb_build_object('status',403,'body',jsonb_build_object('error','Gateway required'));
 END IF;
 IF action='music_guard' THEN
  IF NOT public.hush_take_budget('music:global',20,60) OR NOT public.hush_take_budget('music:network:'||network,10,60) THEN
   RETURN jsonb_build_object('status',429,'body',jsonb_build_object('code','rateLimit','error','Thử tìm lại sau một phút.'));
  END IF;
  RETURN jsonb_build_object('status',200,'body','{}'::jsonb);
 END IF;
 IF action='guard' THEN
  DELETE FROM public.hush_abuse_budgets WHERE expires_at<=clock_timestamp();
  IF NOT public.hush_take_budget('request:global',240,60)
    OR NOT public.hush_take_budget('request:network:'||network,120,60)
    OR NOT public.hush_take_budget('request:owner:'||owner,60,60) THEN
   RETURN jsonb_build_object('status',429,'body',jsonb_build_object('code','rateLimit','error','Chậm lại một chút, thử lại sau 1 phút.'));
  END IF;
  RETURN jsonb_build_object('status',200,'body','{}'::jsonb);
 END IF;
 IF action='create' THEN
  -- Same lock as the storage cap/core create; count + insert cannot race.
  PERFORM pg_advisory_xact_lock(83110641);
  IF (SELECT count(*) FROM public.hush_messages WHERE owner_hash=owner AND expires_at>epoch AND attempts<5)>=2 THEN
   RETURN jsonb_build_object('status',409,'body',jsonb_build_object('code','activeLimit','error','Bạn đang có 2 link còn hiệu lực. Hãy đợi hoặc huỷ một link trước.'));
  END IF;
  IF NOT EXISTS(SELECT FROM public.hush_challenges WHERE id_hash=payload->>'challenge_hash' AND owner_hash=owner) THEN
   RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','Xác nhận chưa đúng. Hãy thử lại.'));
  END IF;
  IF NOT public.hush_take_budget('create:global:day',200,86400)
    OR NOT public.hush_take_budget('create:network:hour:'||network,30,3600)
    OR NOT public.hush_take_budget('create:owner:hour:'||owner,10,3600) THEN
   RETURN jsonb_build_object('status',429,'body',jsonb_build_object('code','createLimit','error','Đã đạt giới hạn tạo link. Hãy thử lại sau.'));
  END IF;
 END IF;
 r:=public.hush_api_core(action,payload);
 IF action='challenge' AND (r->>'status')::integer=200 THEN
  UPDATE public.hush_challenges SET owner_hash=owner WHERE id_hash=payload->>'id_hash';
 ELSIF action='create' AND (r->>'status')::integer=201 THEN
  UPDATE public.hush_messages SET owner_hash=owner WHERE id=payload->>'id';
 END IF;
 RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.hush_api(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hush_api(text,jsonb) TO service_role;

-- Keep existing independent expiry job; also bound pseudonymous budget retention.
SELECT cron.schedule('whisper-housekeeping', '* * * * *',
  $$DELETE FROM public.hush_challenges WHERE issued_at <= clock_timestamp() - interval '120 seconds';
    DELETE FROM public.hush_budgets WHERE window_at <= clock_timestamp() - interval '2 minutes';
    DELETE FROM public.hush_abuse_budgets WHERE expires_at <= clock_timestamp()$$);
