import {EyeOff} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
export function Composer() {
  return (
    <>
      <section id="compose">
        <h1 className="sr-only" data-i18n="newMessage" />
        <form id="compose-form">
          <div id="text-editor">
            <div id="block-gutter">
              <Button id="insert-block" type="button" variant="ghost" data-i18n-aria-label="blockMenu" data-i18n-title="blockMenu"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg></Button>
              <Button id="move-block" type="button" variant="ghost" data-i18n-aria-label="moveBlock" data-i18n-title="moveBlock"><svg viewBox="0 0 20 20" aria-hidden="true">{[6,10,14].flatMap(y=>[7,13].map(x=><circle key={`${x}-${y}`} cx={x} cy={y} r="1" />))}</svg></Button>
            </div>
            <Button id="table-caret-tools" type="button" variant="ghost" hidden data-i18n-aria-label="tableTools" data-i18n-title="tableTools"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 8h14M8 3v14" /></svg></Button>
            <Label htmlFor="message" id="message-label" className="sr-only" data-i18n="content" />
            <div id="rich-toolbar" className="toolbar" role="toolbar" data-i18n-aria-label="format" hidden>
              <Button id="block-type-picker" type="button" variant="ghost" data-i18n-title="turnInto"><span id="current-block-label" data-i18n="blockText" /><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3" /></svg></Button>
              <span className="toolbar-rule" />
              <Button type="button" data-command="bold" data-i18n-aria-label="bold" data-i18n-title="bold" variant="ghost"><b>B</b></Button>
              <Button type="button" data-command="italic" data-i18n-aria-label="italic" data-i18n-title="italic" variant="ghost"><i>I</i></Button>
              <Button type="button" data-command="underline" data-i18n-aria-label="underline" data-i18n-title="underline" variant="ghost"><u>U</u></Button>
              <Button type="button" data-command="strikeThrough" data-i18n-aria-label="strike" data-i18n-title="strike" variant="ghost"><s>S</s></Button>
              <Button type="button" data-inline="spoiler" aria-label="Spoiler" title="Spoiler" variant="ghost"><EyeOff/></Button>
              <Button type="button" data-inline="code" data-i18n-aria-label="inlineCode" data-i18n-title="inlineCode" variant="ghost"><span className="code-symbol">&lt;/&gt;</span></Button>
              <span className="toolbar-rule" />
              <Button type="button" data-inline="link" data-i18n-aria-label="editLink" data-i18n-title="editLink" variant="ghost"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 12 4-4m-5 6H6a4 4 0 0 1-3-7l3-3a4 4 0 0 1 6 1m-4 10a4 4 0 0 0 6 1l3-3a4 4 0 0 0-3-7h-1" /></svg></Button>
              <Button type="button" data-inline="color" data-i18n-aria-label="textColor" data-i18n-title="textColor" variant="ghost"><span className="color-symbol">A</span></Button>
              <Button id="table-tools" type="button" hidden variant="ghost" data-i18n-aria-label="tableTools" data-i18n-title="tableTools"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 8h14M8 3v14" /></svg></Button>
              <Button type="button" data-command="removeFormat" data-i18n-aria-label="clearFormat" data-i18n-title="clearFormat" variant="ghost"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4h12M10 4l-3 12m5-3 5 5m0-5-5 5" /></svg></Button>
            </div>
            <Textarea id="message" data-i18n-aria-label="content" data-i18n-placeholder="write" maxLength={262144} autoComplete="off" spellCheck="false" />
            <div id="rich-editor" contentEditable="true" role="textbox" data-i18n-aria-label="content" aria-multiline="true" spellCheck="false" hidden suppressContentEditableWarning />
          </div>
          <div id="voice-stage" hidden>
            <p id="voice-instruction" data-i18n="hold" />
            <div id="voice-preview" hidden />
            <div className="voice-actions">
              <Button id="delete-recording" type="button" data-i18n="again" hidden variant="outline" />
              <Button id="share-recording" type="button" className="primary" data-i18n="shareVoice" hidden variant="default" />
            </div>
          </div>
        </form>
        <div id="block-actions" className="writing-panel writing-actions" popover="manual" hidden role="menu" data-i18n-aria-label="blockActions">
          {['turn','color','copy','duplicate','up','down','delete'].map((action,index)=><Button key={action} role="menuitem" type="button" variant="ghost" data-block-action={action} className={action==='delete'?'writing-danger':''}><svg viewBox="0 0 20 20" aria-hidden="true" className="action-symbol"><path d={['M3 4h10M8 4v12m4-6h5m-2-2 2 2-2 2','m4 15 5-11 5 11M6 11h6M3 18h13','M7 7h10v10H7zM3 13V3h10','M6 6h11v11H6zM3 11V3h8M9 12h5m-2-2v5','m5 9 5-5 5 5M10 4v12','m5 11 5 5 5-5M10 4v12','M4 5h12M8 5V3h4v2M6 5l1 12h6l1-12'][index]} /></svg><span data-i18n={`blockAction${action}`} /></Button>)}
        </div>
        <div id="table-actions" className="writing-panel writing-actions" popover="manual" hidden role="menu" data-i18n-aria-label="tableTools">
          {['rowAbove','rowBelow','columnLeft','columnRight','headerRow','headerColumn','clearCell','deleteRow','deleteColumn','deleteTable'].map((action,index)=><Button key={action} role="menuitem" type="button" variant="ghost" data-table-action={action} className={action.startsWith('delete')?'writing-danger':''}><svg viewBox="0 0 20 20" aria-hidden="true" className="action-symbol"><path d={['M3 9h14v8H3zM7 4h6m-3-3v6','M3 3h14v8H3zM7 16h6m-3-3v6','M9 3h8v14H9zM1 10h6M4 7v6','M3 3h8v14H3zM13 10h6m-3-3v6','M3 3h14v14H3zM3 7h14M3 5h14','M3 3h14v14H3zM7 3v14M5 3v14','m7 5-5 5 5 5h10V5zM9 8l5 5m0-5-5 5','M3 4h14v12H3zM3 10h14','M3 4h14v12H3zM10 4v12','M4 5h12M8 5V3h4v2M6 5l1 12h6l1-12'][index]} /></svg><span data-i18n={`tableAction${action}`} /></Button>)}
        </div>
        <div id="link-editor" className="writing-panel" popover="manual" hidden>
          <form id="link-form"><Label htmlFor="editor-link" data-i18n="editLink" /><Input id="editor-link" type="url" placeholder="https://" autoComplete="off" required /><p id="editor-link-error" role="alert" hidden data-i18n="safeLink" /><div><Button type="submit" data-i18n="apply" /><Button id="remove-editor-link" type="button" variant="ghost" data-i18n="removeLink" /></div></form>
        </div>
        <div id="color-picker" className="writing-panel" popover="manual" hidden>
          <p data-i18n="textColor" />
          <div className="color-options">{['default','gray','brown','orange','yellow','green','blue','purple','pink','red'].map(color=><Button key={color} type="button" data-ink={color} data-tone={color} data-i18n-aria-label={`color${color}`} variant="ghost">A</Button>)}</div>
          <p data-i18n="highlight" />
          <div className="color-options">{['default','gray','brown','orange','yellow','green','blue','purple','pink','red'].map(color=><Button key={color} type="button" data-highlight={color} data-tone={color} data-i18n-aria-label={`color${color}`} variant="ghost">A</Button>)}</div>
        </div>
      </section>
    </>
  )
}
