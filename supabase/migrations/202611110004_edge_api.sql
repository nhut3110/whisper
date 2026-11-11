-- Edge-only entry point. Browser roles cannot execute this RPC or access tables.
CREATE TABLE public.hush_challenges (
  id_hash text PRIMARY KEY,
  target integer NOT NULL CHECK (target BETWEEN 1 AND 100),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX hush_challenge_expiry ON public.hush_challenges(issued_at);
CREATE TABLE public.hush_budgets (
  action text PRIMARY KEY,
  window_at timestamptz NOT NULL,
  used integer NOT NULL
);
ALTER TABLE public.hush_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hush_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hush_messages, public.hush_challenges, public.hush_budgets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hush_api(action text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p alias for payload;
  cap integer;
  used_now integer;
  c public.hush_challenges;
  m public.hush_messages;
  epoch bigint := floor(extract(epoch from clock_timestamp()));
  count_now bigint;
  size_now bigint;
  status integer := 200;
  result jsonb;
BEGIN
  cap := CASE action WHEN 'challenge' THEN 90 WHEN 'create' THEN 30
    WHEN 'metadata' THEN 180 WHEN 'open' THEN 180 WHEN 'revoke' THEN 60 ELSE 0 END;
  IF cap = 0 THEN RETURN jsonb_build_object('status',404,'body',jsonb_build_object('error','Dữ liệu không hợp lệ.')); END IF;
  -- Shared across cold starts and replicas. No persistent IP/device tracking.
  INSERT INTO public.hush_budgets AS b VALUES (action, clock_timestamp(), 1)
  ON CONFLICT ON CONSTRAINT hush_budgets_pkey DO UPDATE SET
    used = CASE WHEN b.window_at <= clock_timestamp() - interval '60 seconds' THEN 1 ELSE b.used + 1 END,
    window_at = CASE WHEN b.window_at <= clock_timestamp() - interval '60 seconds' THEN clock_timestamp() ELSE b.window_at END
  RETURNING used INTO used_now;
  IF used_now > cap THEN
    RETURN jsonb_build_object('status',429,'body',jsonb_build_object('error','Chậm lại một chút, thử lại sau 1 phút.'));
  END IF;
  IF action = 'challenge' THEN
    DELETE FROM public.hush_challenges WHERE issued_at <= clock_timestamp() - interval '120 seconds';
    INSERT INTO public.hush_challenges(id_hash,target) VALUES (p->>'id_hash',(p->>'target')::integer);
    result := '{}'::jsonb;
  ELSIF action = 'create' THEN
    DELETE FROM public.hush_challenges WHERE id_hash = p->>'challenge_hash' RETURNING * INTO c;
    IF NOT FOUND OR c.issued_at <= clock_timestamp() - interval '120 seconds'
       OR c.issued_at > clock_timestamp() - interval '500 milliseconds' OR c.target <> (p->>'answer')::integer THEN
      -- Return rather than raise: challenge consumption must commit even on failure.
      RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','Xác nhận chưa đúng. Hãy thử lại.'));
    END IF;
    PERFORM pg_advisory_xact_lock(83110641);
    DELETE FROM public.hush_messages WHERE expires_at <= epoch OR attempts >= 5;
    SELECT count(*),coalesce(sum(length(ciphertext)),0) INTO count_now,size_now FROM public.hush_messages;
    IF count_now >= 10000 OR size_now + length(p->>'ciphertext') > 134217728 THEN
      RETURN jsonb_build_object('status',503,'body',jsonb_build_object('error','Tạm thời không thể kết nối. Vui lòng thử lại.'));
    END IF;
    INSERT INTO public.hush_messages(id,ciphertext,iv,access_hash,revoke_hash,pin_hash,expires_at,burn)
    VALUES (p->>'id',p->>'ciphertext',p->>'iv',p->>'access_hash',p->>'revoke_hash',p->>'pin_hash',epoch+(p->>'ttl')::bigint,
      CASE WHEN (p->>'burn')::boolean THEN 1 ELSE 0 END) ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',409,'body',jsonb_build_object('error','Link đã tồn tại. Hãy tạo lại lời nhắn.')); END IF;
    status := 201; result := jsonb_build_object('id',p->>'id','expires_at',epoch+(p->>'ttl')::bigint);
  ELSIF action = 'revoke' THEN
    DELETE FROM public.hush_messages WHERE id = p->>'id' AND revoke_hash = p->>'revoke_hash';
    status := 204; result := NULL;
  ELSE
    -- Lock and validate in ONE transaction: concurrent opens/PIN attempts cannot
    -- bypass the PIN budget or hand out a burn-on-read payload twice.
    SELECT * INTO m FROM public.hush_messages WHERE id = p->>'id' AND access_hash = p->>'access_hash'
      AND expires_at > epoch AND attempts < 5 FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',410,'body',jsonb_build_object('error','Lời nhắn không còn khả dụng hoặc link không đúng.')); END IF;
    IF action = 'metadata' THEN
      result := jsonb_build_object('expires_at',m.expires_at,'burn',m.burn=1,'requires_pin',m.pin_hash<>'');
    ELSE
      IF m.pin_hash <> '' AND m.pin_hash <> p->>'pin_hash' THEN
        IF (p->>'has_pin')::boolean THEN
          UPDATE public.hush_messages SET attempts = attempts + 1 WHERE id = m.id;
          IF m.attempts >= 4 THEN
            DELETE FROM public.hush_messages WHERE id = m.id;
            RETURN jsonb_build_object('status',410,'body',jsonb_build_object('error','Lời nhắn không còn khả dụng hoặc link không đúng.'));
          END IF;
        END IF;
        RETURN jsonb_build_object('status',401,'body',jsonb_build_object('error','Cần mã 6 số chính xác. Sau 5 lần sai, lời nhắn sẽ bị huỷ.'));
      END IF;
      IF m.burn = 1 THEN DELETE FROM public.hush_messages WHERE id = m.id; END IF;
      result := jsonb_build_object('ciphertext',m.ciphertext,'iv',m.iv);
    END IF;
  END IF;
  RETURN jsonb_build_object('status',status,'body',result);
END;
$$;
REVOKE ALL ON FUNCTION public.hush_api(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hush_api(text,jsonb) TO service_role;

-- Keep existing independent message-expiry job; bound challenge/budget retention.
SELECT cron.schedule('whisper-housekeeping', '* * * * *',
  $$DELETE FROM public.hush_challenges WHERE issued_at <= clock_timestamp() - interval '120 seconds';
    DELETE FROM public.hush_budgets WHERE window_at <= clock_timestamp() - interval '2 minutes'$$);
