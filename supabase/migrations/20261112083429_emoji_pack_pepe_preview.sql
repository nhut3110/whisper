-- Admin-reviewed pepe_preview. Source and permission record: shared/emoji-packs.json
INSERT INTO public.whisper_emoji_catalog(id) VALUES
(':pepe_preview_happy:'),
(':pepe_preview_reeeee:'),
(':pepe_preview_stare:'),
(':pepe_preview_wine:')
ON CONFLICT DO NOTHING;
