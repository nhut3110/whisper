# Optical sharing

Whisper renders two local representations of the same share capability:

- **QR:** rounded modules, standard finder patterns, a central W. matching the header brand, high error correction and a four-module quiet zone. The PNG can be saved. Any ordinary QR scanner can read its complete URL.
- **Particle (experimental):** a 72,000-point WebGL volume, with a tilted three-arm galaxy, a spherical stellar core, diffuse outer dust, perspective and additive blue/cyan light. A second shader composites error-corrected QR bits into green-minus-red/blue chromatic differences at deterministic blue-noise sites, rather than drawing a visible dot grid. Four dark violet chromatic dust patches establish perspective without the former bright yellow dots. Their colour difference is detected independently of animated brightness; perspective, affine and similarity fits compensate for small JPEG centroid shifts. Two GPU draw calls per frame, a fixed 480px render target, a 30fps cap, hidden-tab pause and reduced-motion support keep the work bounded. Buffers, textures, shaders, framebuffer and the owned context are disposed on dismissal. Devices without WebGL get a static scannable fallback. This requires Whisper's scanner; it is an independent implementation, not Apple's pairing format, and has not been validated against physical phone cameras.

Visual references (research only, no assets or code copied):
- https://eci.contebio.com/material/blog/tecnologia/Esfera-para-sincronizar-Apple-Watch.jpg
- https://www.elcorteingles.es/contenidos/tecnologia/enlazar-el-apple-watch/
- https://www.macstories.net/stories/watchos-4-review/3/

The share button appears beside a newly created link and beside a chat invite. The header scan button opens the same shadcn dialog. Rendering is lazy-loaded; the decoder runs in a separate same-origin worker only when the camera starts. Camera frames remain local. Scanning stops on success, dismissal, hidden tab, or unmount. A recognized link needs an explicit Open action; scanning alone does not consume a one-time message. Particle rendering pauses in hidden tabs and respects reduced motion.

Only complete, canonical same-origin message links and room invitations are accepted. No external code-generation service sees the capability. Anyone photographing a code obtains the same bearer link; neither format adds encryption or recipient identity verification. Existing expiry, PIN and one-time rules continue to apply.

Dependencies: qrcode-generator (MIT), jsQR (Apache-2.0). Notices are in `public/optical-NOTICES.txt`. ParticlePair was evaluated as a reference, but no code was copied: its source-available license and experimental status do not provide a production-ready Apple-compatible library.

## Local validation

- `npm run typecheck`
- `npm test`
- `npm run build:beta` (set the personal test project ref as for the normal local build)
- Run `tests/edge/api.test.ts` against a disposable PostgreSQL database to initialize message RPCs.
- `EDGE_TEST_BASE=http://localhost:8788 TEST_DATABASE_URL=... npx playwright test -c playwright.optical.config.js`

Browser cases cover real message creation, both optical formats through a simulated video stream and worker, explicit open and successful decryption, camera-track cleanup, permission denial, external-share rejection, room payloads after JPEG compression and 90-degree rotation, desktop/390px/320px layout screenshots, four later animated frames with full payload verification after JPEG compression, GPU rendering, reduced motion, and the no-WebGL fallback. These are synthetic video tests, not a claim of reliable camera performance in changing light, glare, moire or perspective. Physical Android/iOS testing remains necessary, especially for the denser Particle room code. Rust header changes require Rust compilation in an environment with Cargo available.

## Shared share surface and exports

All message kinds and room invitation codes open the same lazy `Panel` in
`frontend/optical/panel.tsx`, with Link / QR / Nebula modes. Existing quick-copy
shortcuts remain available. Nebula colours follow the document theme; chromatic
payload differences are applied after the artwork palette so scanning survives
both themes. QR retains its high-contrast white quiet zone.

PNG exports the canvas directly. Animated GIF exports 32 frames at 480px, encodes
one frame at a time in a lazy worker using gifenc (MIT), and cancels on dismissal.
This bounds memory and keeps quantization off the UI thread. Files remain local;
they contain the bearer capability, so treat them like the link itself.

Generation motion follows the broad-form → focus → grain idea in the public
Generate example at https://bencho.dev/?c=generate&theme=dark (inspected Code tab).
The implementation is a short CSS reveal of our procedural canvas, rather than
copying its image-based component. No Bencho flower images are used. Reduced
motion skips the reveal.

`playwright.sharing.config.js` checks downloaded PNG and actual GIF frames with
the production decoder in both themes, alongside message/chat spoiler privacy.
