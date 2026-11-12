
export function Mascot() {
  return (
    <>
      <aside id="share-dock" className="share-dock">
        <p id="watcher-line" className="watcher-line" aria-live="off" />
        <div id="recording-wave" className="recording-thought" hidden>
          <div id="live-wave" className="voice-wave" aria-hidden="true" />
          <output id="recording-time">
            {"0:00"}
          </output>
        </div>
        <button id="create" className="eyt" type="button" data-i18n-aria-label="create" aria-haspopup="dialog" aria-controls="settings" />
      </aside>
    </>
  )
}
