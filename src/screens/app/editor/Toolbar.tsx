import { useEditorState, type Editor } from '@tiptap/react';
import { useT } from '@/i18n';
import { canIndent, canOutdent, clearFormatting } from './extensions';
import { isMac } from './util';

const PATHS = {
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  bold: 'M7.5 5h5.25a3.5 3.5 0 0 1 0 7H7.5zM7.5 12h6.25a3.5 3.5 0 0 1 0 7H7.5z',
  italic: 'M11 5h7M6 19h7M14.5 5l-5 14',
  underline: 'M7 4.5v6.5a5 5 0 0 0 10 0V4.5M5.5 20h13',
  strike: 'M4.5 12h15M16 7.6C15.4 5.9 13.9 5 12 5c-2.4 0-4 1.2-4 3 0 1.3.8 2.2 2.4 2.8M8 16.4c.6 1.7 2.1 2.6 4 2.6 2.4 0 4-1.2 4-3 0-.5-.1-1-.3-1.4',
  highlight: 'M14.5 4.5l5 5L11 18H6v-5zM12 7l5 5M4 21h9',
  bullets: 'M10 6.5h10M10 12h10M10 17.5h10M4.75 6.5h.01M4.75 12h.01M4.75 17.5h.01',
  numbers: 'M10.5 6.5h9.5M10.5 12h9.5M10.5 17.5h9.5M4 5l1.6-1v5.2M3.6 14.6a1.6 1.6 0 0 1 3.1.4c0 1.2-3.1 2.5-3.1 3.8h3.2',
  indent: 'M4 5h16M11 10h9M11 14h9M4 19h16M4 9.5l3.5 2.5L4 14.5',
  outdent: 'M4 5h16M11 10h9M11 14h9M4 19h16M7.5 9.5L4 12l3.5 2.5',
  left: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  center: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  right: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  justify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  break: 'M12 7.5v5M9.8 8.8l4.4 2.4M14.2 8.8l-4.4 2.4M7 16.5v3.5M5.3 17.4l3.4 1.7M8.7 17.4l-3.4 1.7M17 16.5v3.5M15.3 17.4l3.4 1.7M18.7 17.4l-3.4 1.7',
  clear: 'M5.5 5h11M11 5L8 19M14 13.5l6 6M20 13.5l-6 6',
  move: 'M5 12h13M13 6.5l5.5 5.5-5.5 5.5',
} as const;
export type ToolIconName = keyof typeof PATHS;

export function ToolIcon({ name, size = 18 }: { name: ToolIconName; size?: number }) {
  const heavy = name === 'bold';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={heavy ? 2.5 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

type Style = 'body' | 'heading' | 'subheading' | 'quote';

function readState(e: Editor) {
  const style: Style = e.isActive('heading', { level: 2 }) ? 'heading' : e.isActive('heading', { level: 3 }) ? 'subheading' : e.isActive('quote') ? 'quote' : 'body';
  const align = (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left';
  return {
    style,
    align,
    bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'), highlight: e.isActive('highlight'),
    bullets: e.isActive('bulletList'), numbers: e.isActive('orderedList'),
    canUndo: e.can().undo(), canRedo: e.can().redo(),
    indent: canIndent(e), outdent: canOutdent(e),
    inList: e.isActive('listItem'),
  };
}

/**
 * The formatting bar above the page. Everything here only changes how the author's words look;
 * the words themselves are never touched.
 */
export function Toolbar({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const t = useT('editor');
  const mod = isMac() ? '⌘' : 'Ctrl+';
  const shift = isMac() ? '⇧' : 'Shift+';
  const watched = useEditorState({ editor, selector: ({ editor: e }) => (e ? readState(e) : null) });
  // Before the first transaction the hook may not have a value yet; read it directly.
  const s = watched ?? (editor && !editor.isDestroyed ? readState(editor) : null);
  if (!editor || !s) return <div className="ed-tb is-empty" aria-hidden="true" />;
  const off = !!disabled;
  const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => () => { fn(editor.chain().focus()).run(); };

  const btn = (key: string, icon: ToolIconName, label: string, keys: string, onClick: () => void, o: { pressed?: boolean; dis?: boolean } = {}) => (
    <button
      key={key}
      type="button"
      className="ed-tb-btn"
      aria-label={label}
      aria-pressed={o.pressed === undefined ? undefined : o.pressed}
      aria-keyshortcuts={keys ? keys.replace(/⌘/g, 'Meta+').replace(/⌥/g, 'Alt+').replace(/⇧/g, 'Shift+') : undefined}
      title={keys ? `${label} (${keys})` : label}
      disabled={off || o.dis}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <ToolIcon name={icon} />
    </button>
  );

  const setStyle = (v: Style) => {
    const c = editor.chain().focus();
    if (v === 'heading') c.setNode('heading', { level: 2 }).run();
    else if (v === 'subheading') c.setNode('heading', { level: 3 }).run();
    else if (v === 'quote') c.setNode('quote').run();
    else c.setParagraph().run();
  };
  const setAlign = (a: 'left' | 'center' | 'right' | 'justify') => {
    const c = editor.chain().focus();
    if (a === 'left') c.unsetTextAlign().run(); else c.setTextAlign(a).run();
  };

  return (
    <div className="ed-tb" role="toolbar" aria-label={t('tb.label')} aria-disabled={off || undefined}>
      <div className="ed-tb-group">
        {btn('undo', 'undo', t('tb.undo'), `${mod}Z`, run((c) => c.undo()), { dis: !s.canUndo })}
        {btn('redo', 'redo', t('tb.redo'), `${mod}${shift}Z`, run((c) => c.redo()), { dis: !s.canRedo })}
      </div>
      <span className="ed-tb-sep" aria-hidden="true" />
      <div className="ed-tb-group">
        <label className="sr-only" htmlFor="ed-tb-style">{t('tb.style')}</label>
        <select
          id="ed-tb-style"
          className="ed-tb-select"
          value={s.inList ? 'body' : s.style}
          disabled={off || s.inList}
          title={t('tb.style')}
          onChange={(e) => setStyle(e.target.value as Style)}
        >
          <option value="body">{t('tb.body')}</option>
          <option value="heading">{t('tb.heading')}</option>
          <option value="subheading">{t('tb.subheading')}</option>
          <option value="quote">{t('tb.quote')}</option>
        </select>
      </div>
      <span className="ed-tb-sep" aria-hidden="true" />
      <div className="ed-tb-group">
        {btn('b', 'bold', t('tb.bold'), `${mod}B`, run((c) => c.toggleBold()), { pressed: s.bold })}
        {btn('i', 'italic', t('tb.italic'), `${mod}I`, run((c) => c.toggleItalic()), { pressed: s.italic })}
        {btn('u', 'underline', t('tb.underline'), `${mod}U`, run((c) => c.toggleUnderline()), { pressed: s.underline })}
        {btn('s', 'strike', t('tb.strike'), `${mod}${shift}S`, run((c) => c.toggleStrike()), { pressed: s.strike })}
        {btn('h', 'highlight', t('tb.highlight'), `${mod}${shift}H`, run((c) => c.toggleHighlight()), { pressed: s.highlight })}
      </div>
      <span className="ed-tb-sep" aria-hidden="true" />
      <div className="ed-tb-group">
        {btn('ul', 'bullets', t('tb.bullets'), `${mod}${shift}8`, run((c) => c.toggleBulletList()), { pressed: s.bullets })}
        {btn('ol', 'numbers', t('tb.numbers'), `${mod}${shift}7`, run((c) => c.toggleOrderedList()), { pressed: s.numbers })}
        {btn('out', 'outdent', t('tb.outdent'), `${shift}Tab`, run((c) => c.liftListItem('listItem')), { dis: !s.outdent })}
        {btn('in', 'indent', t('tb.indent'), 'Tab', run((c) => c.sinkListItem('listItem')), { dis: !s.indent })}
      </div>
      <span className="ed-tb-sep" aria-hidden="true" />
      <div className="ed-tb-group">
        {btn('al', 'left', t('tb.alignLeft'), `${mod}${shift}L`, () => setAlign('left'), { pressed: s.align === 'left', dis: s.inList })}
        {btn('ac', 'center', t('tb.alignCenter'), `${mod}${shift}E`, () => setAlign('center'), { pressed: s.align === 'center', dis: s.inList })}
        {btn('ar', 'right', t('tb.alignRight'), `${mod}${shift}R`, () => setAlign('right'), { pressed: s.align === 'right', dis: s.inList })}
        {btn('aj', 'justify', t('tb.justify'), `${mod}${shift}J`, () => setAlign('justify'), { pressed: s.align === 'justify', dis: s.inList })}
      </div>
      <span className="ed-tb-sep" aria-hidden="true" />
      <div className="ed-tb-group">
        {btn('br', 'break', t('tb.sceneBreak'), `${mod}${shift}Enter`, run((c) => c.setHorizontalRule()))}
        {btn('cl', 'clear', t('tb.clear'), `${mod}\\`, () => { clearFormatting(editor); })}
      </div>
    </div>
  );
}
