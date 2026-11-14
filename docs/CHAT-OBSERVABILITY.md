# Capture and copy signals (researched 2026-11-13)

## Screenshot detection

A browser page has no general OS screenshot-taken callback in the documented web platform. The W3C Screen Capture specification defines an explicitly authorized media stream, not notification of another process capturing the page. Calling getDisplayMedia would request screen sharing; it cannot silently detect screenshots. Installing the site as a PWA does not grant UIKit/Android Activity callbacks.

- W3C Screen Capture Working Draft: https://www.w3.org/TR/screen-capture/ (2026-08-27).
- MDN getDisplayMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
- MDN Page Visibility: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API — hidden/blur is not evidence of capture.
- Android 14+ Activity.ScreenCaptureCallback: https://developer.android.com/about/versions/14/features/screenshot-detection . Requires a native Activity and DETECT_SCREEN_CAPTURE permission; documented Android 14 detection covers hardware-button combinations, not ADB/instrumentation. A native wrapper could bridge supported callbacks to the authenticated room API in a future app. This is not implemented by the website.
- Apple UIKit UIApplication.userDidTakeScreenshotNotification: https://developer.apple.com/documentation/uikit/uiapplication/userdidtakescreenshotnotification . Notification arrives after capture. Native apps can bridge it; a Safari page cannot subscribe to UIKit. Recording/mirroring uses separate capture-state APIs, not this screenshot notification.

Current web behavior: listen for observable PrintScreen keydown/keyup and Cmd/Win screenshot shortcut patterns; deduplicate reports for 30 seconds and attribute them on the server to the authenticated member. Notices explicitly say capture is unverified. Key events can be swallowed by the OS/browser, and users can cancel a capture dialog after the shortcut. Native mobile screenshots, DevTools/browser screenshots, extensions, external capture tools and cameras may produce no event. A screenshot made during QA must not be faked into an OS-confirmed detection notice. No blur/visibility heuristic, clipboard reading, image upload or permission prompt is used.

## Host-only copy notices

The message action records only after Clipboard.writeText succeeds. Native browser copy uses the trusted copy event and the selected message range; this means a copy action was initiated, not independent proof that every browser/OS completed a clipboard write. The shadcn context-menu bridge reports a successful application copy with its saved DOM Range. Draft/invite/other-page copies do not count. For a single message the report carries its sequence number; a selection spanning multiple messages records a generic copy notice. No plaintext, selection text or clipboard data is sent.

The authenticated RPC supplies the actor's name/id. Guests cannot set another actor or read these events: chat_sync excludes copied events for every non-host, including the copier. UI filtering is not the authorization boundary. Clients can suppress/spoof their own telemetry, so this is an activity hint, not tamper-proof auditing. Reports are deduplicated for one second per message and capped at 20/member/minute. Keep at most 100 public notices and 100 private copy notices separately; both cascade on room destruction/expiry.

Native copy-event semantics: https://developer.mozilla.org/en-US/docs/Web/API/Element/copy_event . Synthetic copy events do not copy to the system clipboard and are ignored by the native-event listener.

## File download checkpoint

A successful authorized attachment retrieval emits a public `downloaded` checkpoint with the server-attributed member and message sequence. The UI reuses the existing shadcn Marker, shows a Download icon, and resolves the filename from the already-decrypted message locally. Clicking it scrolls to that message; a removed message falls back to a disabled sequence reference. English and Vietnamese are supported. No plaintext filename or file bytes are stored in the event row.

The server records only after successfully fetching ciphertext from private Storage (or reading a legacy inline attachment), then rechecks room membership/expiry and message existence under the room lock. Unauthorized requests, missing files and Storage failures do not produce a checkpoint. Downloads are not exposed as a client-reportable telemetry route. Records are deduplicated per member/message for one second, limited to 20/member/minute, share the existing 100 public checkpoint cap and cascade with the room. Copy notices retain their host-only visibility.

This confirms that the server handled a file download, not that the recipient successfully decrypted or saved the file to disk; browser save completion is not observable by a normal webpage. Network loss after recording can still prevent the client receiving the response.
