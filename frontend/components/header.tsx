import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
export function Header() {
  return (
    <>
      <SiteHeader>
          <Button id="theme-toggle" className="icon-button" type="button" aria-label="Theme" aria-pressed="false" variant="ghost">
            <svg className="moon-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" />
            </svg>
            <svg className="sun-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
            </svg>
          </Button>
          <Button id="copy-draft" className="icon-button" type="button" data-i18n-aria-label="copy" data-i18n-title="copy" variant="ghost">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="13" rx="2" />
              <path d="M15 5V3H3v13h2" />
            </svg>
          </Button>
          <Button id="copy-all" className="icon-button" type="button" data-i18n-aria-label="copyAll" data-i18n-title="copyAll" hidden variant="ghost">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="13" rx="2" />
              <path d="M15 5V3H3v13h2" />
            </svg>
          </Button>
          <div className="language-control">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 5h12M9 3v2m4 0c-1 6-5 10-10 12m2-9c1 4 4 7 8 9m1 3 4-10 4 10m-6-3h4" />
            </svg>
            <Label className="sr-only" htmlFor="language" data-i18n="language" />
            <NativeSelect id="language" data-i18n-aria-label="language" data-i18n-title="language">
              <NativeSelectOption value="auto" data-i18n="system" />
            </NativeSelect>
          </div>
          <nav id="compose-actions">
            <div className="mode-switch" role="group" data-i18n-aria-label="message">
              <Button id="text-mode" className="icon-button" type="button" data-i18n-aria-label="text" data-i18n-title="text" aria-pressed="true" variant="ghost">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 5h16M12 5v15M8 20h8" />
                </svg>
              </Button>
              <Button id="audio-mode" className="icon-button" type="button" data-i18n-aria-label="voice" data-i18n-title="voice" aria-pressed="false" variant="ghost">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M6 10v2a6 6 0 0 0 12 0v-2m-6 8v4m-4 0h8" />
                </svg>
              </Button>
              <Button id="music-mode" className="icon-button music-mode" type="button" data-i18n-aria-label="music" data-i18n-title="music" aria-pressed="false" hidden variant="ghost">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 18V5l12-2v13M9 9l12-2" />
                  <ellipse cx="6" cy="18" rx="3" ry="2.5" />
                  <ellipse cx="18" cy="16" rx="3" ry="2.5" />
                </svg>
              </Button>
              <Button id="room-mode" className="icon-button" type="button" data-i18n-aria-label="chat" data-i18n-title="chat" aria-pressed="false" variant="ghost"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4Z"/></svg></Button>
            </div>
          </nav>
      </SiteHeader>
    </>
  )
}
