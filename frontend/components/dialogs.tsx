import { OptionCheckbox } from '@/components/option-checkbox'
import { BrandMark } from '@/components/brand-mark'
import { SettingsIcon } from '@/components/settings-icon'
import { CloseIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ExpiryPicker } from '@/components/expiry-picker'
import { WhisperDialog } from '@/components/whisper-dialog'
export function Dialogs() {
  return (
    <>
      <WhisperDialog id="privacy-warning" aria-labelledby="privacy-title">
        <div className="dialog-heading">
          <h2 id="privacy-title">
            {"Uh oh."}
          </h2>
          <Button type="button" className="icon-button" data-dismiss="privacy-warning" data-i18n-aria-label="close" variant="ghost">
            <CloseIcon />
          </Button>
        </div>
        <p data-i18n="inspectNotice" />
      </WhisperDialog>
      <WhisperDialog id="recipient-open" aria-labelledby="recipient-title">
        <div className="dialog-heading">
          <h2 id="recipient-title" data-i18n="open" />
          <Button type="button" className="icon-button" data-dismiss="recipient-open" data-i18n-aria-label="close" variant="ghost">
            <CloseIcon />
          </Button>
        </div>
        <p id="receive-note" className="muted" data-i18n="checking" />
        <form id="open-form">
          <Label htmlFor="pin" data-i18n="pinLabel" />
          <div className="pin-code" id="pin-code">
            <div className="pin-cells" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <i className="pin-caret" aria-hidden="true" />
            <Input id="pin" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" data-1p-ignore="" data-lpignore="true" data-bwignore="" spellCheck="false" data-i18n-aria-label="pinLabel" />
          </div>
          <p id="open-error" role="alert" />
          <Button type="submit" id="open" className="primary" data-i18n="open" variant="default" />
        </form>
      </WhisperDialog>
      <WhisperDialog id="recipient-close" aria-labelledby="close-title">
        <div className="dialog-heading">
          <h2 id="close-title" data-i18n="closeMessage" />
          <Button type="button" className="icon-button" data-dismiss="recipient-close" data-i18n-aria-label="close" variant="ghost">
            <CloseIcon />
          </Button>
        </div>
        <p data-i18n="closeHint" />
        <Button id="clear" type="button" className="primary" data-i18n="closeMessage" variant="default" />
      </WhisperDialog>
      <WhisperDialog id="settings" aria-labelledby="settings-title">
        <div className="dialog-heading setup-heading">
          <div className="setup-title"><span className="setup-stamp" aria-hidden="true"><BrandMark /></span><h2 id="settings-title" data-i18n="settings" /></div>
          <Button id="settings-close" type="button" className="icon-button" data-i18n-aria-label="close" variant="ghost">
            <CloseIcon />
          </Button>
        </div>
        <div className="options">
          <section className="setup-expiry">
            <div id="expiry-label" className="setup-section-label"><SettingsIcon kind="clock" /><span data-i18n="expires" /></div>
            <ExpiryPicker />
          </section>
          <div id="custom-expiry" className="expiry-row" hidden>
            <Label htmlFor="ttl-minutes" data-i18n="minutes" />
            <Input id="ttl-minutes" type="number" min="1" max="10080" step="1" defaultValue="30" />
          </div>
          <Label className="setting-option"><SettingsIcon kind="once" /><span data-i18n="oneRead" /><OptionCheckbox id="burn" defaultChecked /></Label>
          <Label className="setting-option"><SettingsIcon kind="lock" /><span data-i18n="addCode" /><OptionCheckbox id="use-pin" /></Label>
          <Label className="setting-option" id="format-option"><SettingsIcon kind="type" /><span data-i18n="format" /><OptionCheckbox id="rich-mode" /></Label>
        </div>
        <div className="setup-footnote">
          <div className="message-capacity"><div><span data-i18n="messageSize" /><output id="count" /></div><meter id="size-meter" min="0" max="262144" value="0" data-i18n-aria-label="messageSize" /></div>
          <details className="setup-privacy"><summary><SettingsIcon kind="shield" /><span data-i18n="privacy" /><span className="privacy-plus" aria-hidden="true">+</span></summary><p data-i18n="privacyNote" /></details>
        </div>
        <p id="settings-error" role="alert" hidden />
        <div id="verification" aria-busy="true">
          <p id="verify-loading" role="status" data-i18n="preparing" />
          <div id="verify-body" hidden>
          <p id="challenge-label" className="challenge-label" aria-live="polite" data-i18n="preparing" />
          <div id="desktop-challenge" className="wks">
            <div id="wake-track" className="wks-track" role="slider" tabIndex={0} aria-labelledby="challenge-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} aria-describedby="challenge-label" />
            <output id="wake-value">
              {"0"}
            </output>
          </div>
          <div id="mobile-challenge" className="sld" hidden>
            <div id="slide-track" className="sld-track">
              <i className="sld-wash" aria-hidden="true" />
              <span className="sld-say" data-i18n="slide" />
              <button type="button" className="sld-grip" data-i18n-aria-label="slide">
                <span className="sld-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 12h16m-6-6 6 6-6 6" />
                  </svg>
                </span>
                <span className="sld-done" data-i18n="confirmed" hidden />
              </button>
            </div>
          </div>
          </div>
          <div id="verify-failure" hidden><p id="verification-note" role="alert" />
          <Button id="challenge-retry" type="button" data-i18n="retry" hidden variant="outline" />
          </div>
        </div>
        <Button id="settings-done" className="primary" type="button" data-i18n="create" disabled variant="default" />
      </WhisperDialog>
    </>
  )
}
