# Additional encryption: research, not enabled

The user chose to research this feature first and keep the current six-digit code. No new cryptographic format or “super encryption” switch is shipped in this update.

## What the current protection does

Whisper encrypts text/audio on the sending device with AES-GCM. A random 128-bit seed in the URL fragment derives separate lookup, access and encryption values through HKDF domain separation. The fragment is not sent in HTTP requests. A database dump alone does not contain the seed or encryption key.

The optional six-digit code gates the open RPC. The server stores a keyed HMAC of that code, using a pepper outside the database, and atomically deletes the row on the fifth supplied wrong code. Missing codes and wrong access capabilities do not consume the code-attempt budget. The recipient must explicitly open; previews do not count as opens or PIN attempts. The code is generated randomly today; it is not identity verification or SMS delivery.

A stolen complete link without its separately sent PIN cannot normally retrieve the ciphertext through the API. However, a dump of the database plus the complete link already supplies both ciphertext and its AES key: the attacker can decrypt offline without asking the server for permission. The PIN does not add encryption to the payload. Deleting the live row cannot destroy an attacker's previous copy, backups, exported data or screenshots.

## Recommended future design

Use a separately agreed secret phrase, kept out of the link and server, to derive an additional wrapping key on the client. Generate a random content key for every message, encrypt the payload with authenticated encryption, then wrap that content key with a versioned key derived from the phrase and fresh random salt. Bind the message identifier, version and parameters as authenticated data. A complete link alone must no longer supply enough material to unwrap the content key.

Use a well-maintained, audited Argon2id implementation, vendored and pinned locally, rather than a homemade cipher/KDF. Benchmark a baseline such as 64 MiB, three iterations and one lane on actual supported phones before choosing the final versioned parameters. Enforce bounded parameters when parsing envelopes so an attacker cannot request unlimited work. OWASP's current minimum is Argon2id 19 MiB, two iterations, one lane; that password-storage guidance informs KDF cost but does not replace review of this encryption protocol. No cryptographic dependency was added yet.

Prefer six randomly selected Diceware-style words for about 77 bits of phrase entropy with a 7,776-word list. Four independently random words offer about 52 bits; a familiar quote, anniversary or phrase someone invented is not equivalent. Six decimal digits have fewer than 20 bits (one million possibilities) and should not be marketed as safe against offline guessing. Slowing guesses makes a weak secret more costly; it does not make it a strong one.

Keep the existing server code gate and five-attempt policy as a separate online defence. A stronger future code protocol would need a reviewed design (potentially a PAKE/OPAQUE library and separate secrets) and a precise compromise model. A local counter, JavaScript obfuscation, erasing the UI or a database attempt column cannot constrain offline attempts against stolen data. An attacker who knows the agreed phrase is indistinguishable from the intended recipient in an account-free design. For actual person/device binding, add recipient public keys/passkeys with authenticated key exchange instead.

A compromised serving frontend could replace JavaScript and steal the phrase as it is entered. E2EE does not remove the need to protect deployments, dependencies and the origin. Screen recording and an external camera remain outside normal web control. Do not promise absolute recipient identity, forensic erasure or recovery of forgotten phrases.

Before release: independent crypto review; published fixed test vectors; wrong phrase/tampering tests; text and audio roundtrips; mobile memory/time tests; version compatibility; interrupted-operation recovery; no secret in URLs, previews, logs, browser persistence or error reports; accessibility and keyboard checks. Decrypt/wrap operations must never consume a one-time message merely because a preview or input animation completed.

## Browser controls and previews

The custom menu only exposes Copy, Paste and Cut, enabling them according to selection and editability. Common inspection shortcuts trigger a warning and pause playback/recording. These are UX restrictions, not protection against a hostile recipient: DevTools can be opened through browser menus or before navigation, extensions can read the page, and JavaScript can be modified or disabled. There is no supported website API that reliably disables DevTools.

Normal text/rich-text pages cannot block operating-system screenshots like DRM-protected video. Encrypted Media Extensions applies to protected media streams/CDMs; it is not a DRM wrapper for arbitrary HTML. Permissions-Policy `display-capture=()` only prevents this document from invoking `getDisplayMedia()`; it does not stop the OS, another page/app, extensions or cameras from capturing the screen. We do not use debugger loops, timing/dimension heuristics or falsely claim screenshot prevention. Print output hides content as a limited additional deterrent.

New links use `/s/<96-bit-public-preview-handle>#<128-bit-secret-seed>`. Only burn-on-read and expiry are exposed for previews. Readable content, audio, keys, access/revocation capabilities, PIN and PIN-required status are excluded. The preview handle is the first 16 base64url characters of the random lookup ID; it is a locator, not an open capability. Existing root-fragment and legacy links remain supported but have no individualized server-visible preview. New URLs are slightly longer to allow real crawler metadata.

Vercel renders Open Graph/Twitter tags and one of three static brand cards. A rate-limited, service-role-only Supabase RPC returns the two permitted fields without locking, reading plaintext or consuming a message. No additional provider is needed. Supabase Free rewrites HTML responses to text/plain, so HTML is intentionally rendered on Vercel, with the full app shell included in the function. If preview lookup is unavailable, a generic shell still lets the recipient attempt opening. Public previews return an unavailable card after expiry, consumption or revocation. Social platforms may cache an older preview; Whisper cannot retract their copies or force a new fetch. The precise expiration is UTC in metadata to avoid a misleading timezone.

## Sources checked

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Cryptographic Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- MDN DevTools: https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Tools_and_setup/What_are_browser_developer_tools
- MDN Encrypted Media Extensions: https://developer.mozilla.org/en-US/docs/Web/API/Encrypted_Media_Extensions_API
- MDN display-capture policy: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/display-capture
- Supabase HTML response limit: https://supabase.com/docs/guides/functions/http-methods
- Bencho One-time code, public source and MIT licence: https://bencho.dev/blocks/one-time-code and https://bencho.dev/licence
