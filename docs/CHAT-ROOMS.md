# Anonymous rooms

Chat is a lazy-loaded fourth mode beside Text, Voice and Music on the main screen (`/?mode=chat`), using the shared header and shadcn controls. Existing `/chat` invitations open this same screen. The official shadcn catalog does not supply a complete Messenger chat product. Rooms currently translate English and Vietnamese; other browser languages use English.

## Behavior

- Mandatory server-enforced TTL: 5 minutes–48 hours. The UI offers 1/6/24/48 hours and defaults to 24.
- 2–12 participants including host, default 4. A seat is a membership, not a heartbeat: closing a tab does not silently release a seat. Reload resumes through session storage; explicitly leaving frees a guest seat. Host leave destroys the room.
- Total mode: default 100, configurable 10–1,000; after that, no new messages. Reading, reactions, editing and deletion remain possible until expiry. Deleting a message does not reset the lifetime count.
- Rolling mode: keep 1–200 latest messages (default 50). Every send above N removes earlier message ciphertext, attachments and reactions atomically. Replies to removed messages show a fallback.
- Reply, edit/delete own messages, Unicode/custom emoji reactions, coarse typing/presence and seen receipts. No media calls, forwarding, push notifications, search or arbitrary rich HTML.
- Text up to 4,000 characters. URL cards use Open Graph images, title and description when available, with a compact address fallback. Opening a link always requires confirmation. The Whisper gateway sees URLs requested for preview and retrieves public metadata and bounded raster images; the browser makes no direct image request to the destination and no third-party preview API is used. Metadata does not verify the destination’s safety. See CHAT-UI.md for fetch limits and network protections.
- PNG/JPEG/WebP/PDF/UTF-8 TXT/CSV only, up to 256 KiB each. The browser validates extension and signature where applicable, including after decryption on download. Attachments download as octet-stream, never execute/inline-render in the app. This is not an antivirus guarantee; downloads warn the recipient.
- Room ciphertext/file budget 2 MiB. Two active rooms per anonymous owner; five creations/hour; 50 active rooms globally. Distributed database and warm gateway limits bound requests and sending. These are basic abuse brakes, not DDoS protection.

## Privacy and lifetime

A room invite contains three independent 256-bit values: ID, admission capability and AES-GCM key. Key and capability stay in the URL fragment, which is not sent in an HTTP request. Joining sends the capability only to the API; it stores the SHA-256 hash. A member has a separate random secret, hashed server-side. The browser removes the invite fragment after joining and stores the room session in sessionStorage to survive reload. Do not log invite links or capabilities.

Text, file names and bytes are encrypted in-browser with AES-256-GCM, a fresh IV, and AAD bound to the room and text/file purpose. Server metadata includes nicknames, membership, reactions, presence/read positions, timestamps, limits and hashed owner/network IDs. This does not hide the social graph or traffic from the operator. Anyone with a valid invite can join if a seat is free and can read retained messages; this is not proof of a person's identity. All members share a room key. A departed member who retained data/key cannot be forced to forget it; removing a seat does not rotate the key. This first version therefore has no kick/ban promise.

Room-level row locking serializes admission and mutations. Message nonces make retries idempotent while a message is retained. Expired rooms return 410 immediately, even before cleanup. A new minute cron task cascades physical removal from the live database. Manual host destruction and rolling deletion cascade within the transaction. Providers' WAL, backups, logs, client copies and screenshots are outside a promise of instant erasure; do not advertise “no trace”. Content already downloaded/copied by recipients cannot be revoked.

The first version uses visible-tab polling at ~3 seconds, pauses hidden tabs and inactive Chat mode and decrypts only changed messages. Attachments are fetched only on download. This works with Vercel + Supabase without another service, but is not a WebSocket realtime guarantee. Scale requires a reviewed Realtime/RLS design and budget changes.

## Local verification and deployment

Use a dedicated disposable PostgreSQL database, never another project's DB.

1. `TEST_DATABASE_URL=... npm run test:edge` initializes/checks message and room migrations (destructive to the disposable test tables).
2. `SUPABASE_PROJECT_REF=... npm run build:beta` creates the Vercel build output.
3. `TEST_DATABASE_URL=... npm run dev:chat` serves `http://localhost:8788/?mode=chat` using the actual signed gateway, Edge handler and PostgreSQL RPC.
4. `TEST_DATABASE_URL=... npm run test:chat` runs multi-context browser tests against that bridge.

The Rust/SQLite legacy message backend does not implement chat rooms; Vite proxies `/api/rooms` to the local Edge bridge. Hosted rooms use the existing Vercel gateway and dedicated `hush_chat_api` service-role-only RPC. A new migration creates private RLS-enabled tables and the independent room expiry cron. The deploy script verifies all three cleanup jobs. No production changes happen until an approved push/deploy. CI includes PostgreSQL/API and multi-browser room tests.
