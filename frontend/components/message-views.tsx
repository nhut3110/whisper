import { CloseIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
export function MessageViews() {
  return (
    <>
      <section id="created" hidden>
        <h1 data-i18n="ready" />
        <p id="expiry" className="muted" />
        <p id="link-reminder" className="muted" data-i18n="linkOnce" />
        <Label htmlFor="share-link" data-i18n="messageLink" />
        <div className="copy-row">
          <Input id="share-link" readOnly autoComplete="off" dir="ltr" />
          <Button type="button" id="copy-link" data-i18n="copy" variant="outline" />
        </div>
        <div id="pin-result" hidden>
          <Label htmlFor="generated-pin" data-i18n="codeLabel" />
          <div className="pin-row">
            <output id="generated-pin" dir="ltr" />
            <Button type="button" id="copy-pin" data-i18n="copyCode" variant="outline" />
          </div>
        </div>
        <details className="revoke-block">
          <summary data-i18n="revokeEarly" />
          <Label htmlFor="revoke-link" data-i18n="revokeLink" />
          <div className="copy-row">
            <Input id="revoke-link" readOnly autoComplete="off" dir="ltr" />
            <Button type="button" id="copy-revoke" data-i18n="copy" variant="outline" />
          </div>
        </details>
        <a className="text-link" href="/" data-i18n="newMessage" />
      </section>
      <section id="receive" hidden>
        <h1 className="sr-only" data-i18n="open" />
      </section>
      <div id="music-stage" hidden>
        <iframe id="music-frame" title="Music" allow="autoplay" />
        <Button id="share-music" className="icon-button" type="button" data-i18n-aria-label="create" hidden variant="ghost">
          {"↗"}
        </Button>
        <Button id="close-music" className="icon-button" type="button" data-i18n-aria-label="closeMessage" hidden variant="ghost">
          <CloseIcon />
        </Button>
      </div>
      <section id="reading" hidden>
        <h1 className="sr-only" data-i18n="message" />
        <div id="plaintext" className="message-content" />
        <div id="received-audio" hidden />
        <div className="selection-actions">
          <Button id="copy-selection" type="button" data-i18n="copySelection" hidden variant="outline" />
        </div>
      </section>
      <section id="destroy" hidden>
        <h1 data-i18n="revokeQuestion" />
        <p className="muted" data-i18n="irreversible" />
        <Button id="revoke" className="primary danger" type="button" data-i18n="revokeNow" variant="default" />
      </section>
      <section id="ended" hidden>
        <h1 className="sr-only" data-i18n="closed" />
        <p id="ended-note" className="sr-only" />
      </section>
    </>
  )
}
