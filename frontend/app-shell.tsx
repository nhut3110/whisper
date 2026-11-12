import { Header } from '@/components/header'
import { Composer } from '@/components/composer'
import { MessageViews } from '@/components/message-views'
import { Mascot } from '@/components/mascot'
import { Dialogs } from '@/components/dialogs'
import { EditorOverlays } from '@/components/editor-overlays'

/** Static shell; custom controllers own the imperative editor/media islands.
 * Keep this tree stable: do not rerender their DOM while a message is open.
 */
export function AppShell() {
 return <>
  <Header />
  <main className="workspace"><Composer /><MessageViews /></main>
  <Mascot />
  <EditorOverlays />
  <Dialogs />
 </>
}
