-- Admin-reviewed whisper. Source and permission record: shared/emoji-packs.json
INSERT INTO public.whisper_emoji_catalog(id) VALUES
(':whisper_hello:')
ON CONFLICT DO NOTHING;
