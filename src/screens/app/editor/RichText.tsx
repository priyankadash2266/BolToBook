import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useT } from '@/i18n';
import { countWords } from '@/lib/text';
import { toPlain } from '@/lib/markdown';
import { decoKey, deskExtensions } from './extensions';
import { docToMd, indexOfOrdinal, mdToDoc, ordinalOf, plainPositions, sliceToMd, textEnds, writtenBlocks } from './pmMarkdown';
import { prefersReducedMotion, type Seg } from './util';
import { ToolIcon } from './Toolbar';

/** Where to put the caret: a document position, a block (Markdown block index) start/end, or the end of the text. */
export type CaretTarget = number | { block: number; at: 'start' | 'end' } | 'end';

export interface DeskHighlight { block: number; ranges: [number, number][]; label?: string; key: number }
export interface DeskSelection { from: number; to: number; md: string; words: number }

export interface DeskEditorHandle {
  editor: Editor | null;
  focusAt(t?: CaretTarget): void;
  /** The caret (selection head). */
  caret(): number;
  /** Plain text of the caret's block before and after `pos`. */
  context(pos: number): { before: string; after: string };
  /** Writes plain text in at `pos` ("\n\n" = new paragraph, "\n" = line break); returns the caret after it. Not an autosave edit: the caller commits. */
  insertPlain(pos: number, text: string): number;
  /** Removes the selection (the caller commits); returns the new Markdown. */
  deleteSelection(): string;
  md(): string;
  /** Markdown block index at a position. */
  blockAt(pos: number): number;
}

interface Props {
  md: string;
  onChange: (md: string) => void;
  editable: boolean;
  placeholder: string;
  className: string;
  ariaLabel: string;
  ghost?: { pos: number; segs: Seg[] } | null;
  highlight?: DeskHighlight | null;
  onReady?: (e: Editor) => void;
  onSelection?: (s: DeskSelection | null) => void;
  onMoveSelection?: () => void;
}

function ghostDom(segs: Seg[]): HTMLElement {
  const root = document.createElement('span');
  root.className = 'ed-ghost';
  root.setAttribute('aria-hidden', 'true');
  for (const s of segs) {
    if (s.caret) {
      const c = document.createElement('span');
      c.id = 'ed-live-caret';
      c.className = 'caret';
      root.appendChild(c);
      continue;
    }
    if (!s.t) continue;
    const span = document.createElement('span');
    if (s.cls) span.className = s.cls;
    s.t.split(/(\n{2,}|\n)/).forEach((part) => {
      if (!part) return;
      if (part.startsWith('\n\n')) { const b = document.createElement('span'); b.className = 'ed-ghost-para'; span.appendChild(b); }
      else if (part === '\n') span.appendChild(document.createElement('br'));
      else span.appendChild(document.createTextNode(part));
    });
    root.appendChild(span);
  }
  return root;
}

/**
 * The page itself: a rich-text editor whose truth is the chapter Markdown.
 * Typing → Markdown → `onChange` (autosave). New Markdown from outside (dictation, a spoken change,
 * a restore) is loaded in place, keeping the caret near where it was.
 */
export const RichText = forwardRef<DeskEditorHandle, Props>(function RichText(props, ref) {
  const { md, onChange, editable, placeholder, className, ariaLabel, ghost, highlight, onReady, onSelection, onMoveSelection } = props;
  const t = useT('editor');
  const lastMd = useRef(md);
  const silent = useRef(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const selRef = useRef(onSelection);
  selRef.current = onSelection;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);

  const initial = useMemo(() => mdToDoc(md), []); // eslint-disable-line react-hooks/exhaustive-deps
  const editor = useEditor({
    extensions: deskExtensions(placeholder),
    content: initial,
    editable,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: `ed-pm ${className}`, 'aria-label': ariaLabel, 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true' },
    },
    onUpdate: ({ editor: e }) => {
      if (silent.current) return;
      const out = docToMd(e.state.doc);
      if (out === lastMd.current) return;
      lastMd.current = out;
      changeRef.current(out);
    },
  });

  useEffect(() => {
    if (!editor) return;
    onReady?.(editor);
    // Dev-only hook for automated checks.
    if (process.env.NODE_ENV === 'development') (window as unknown as { __deskEditor?: Editor }).__deskEditor = editor;
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { editor?.setEditable(editable, false); }, [editor, editable]);
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.className = `ed-pm ${className}${editable ? '' : ' is-locked'}`;
    dom.setAttribute('aria-label', ariaLabel);
  }, [editor, className, ariaLabel, editable]);

  // Markdown from outside: load it in place.
  useLayoutEffect(() => {
    if (!editor || md === lastMd.current) return;
    const { from } = editor.state.selection;
    silent.current = true;
    try {
      editor.commands.setContent(mdToDoc(md), { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.max(1, Math.min(from, max - 1)));
    } finally { silent.current = false; }
    lastMd.current = md;
  }, [editor, md]);

  // Found words and the live dictation, as decorations.
  useEffect(() => {
    if (!editor) return;
    const { state, view } = editor;
    const decos: Decoration[] = [];
    let foundPos: number | null = null;
    if (highlight) {
      const blocks = writtenBlocks(state.doc);
      const b = blocks[ordinalOf(lastMd.current, highlight.block)];
      if (b) {
        foundPos = b.pos;
        decos.push(Decoration.node(b.pos, b.pos + b.node.nodeSize, { class: 'ed-found', ...(highlight.label ? { 'data-label': highlight.label } : {}) }));
        const map = plainPositions(b.node, b.pos);
        for (const [a, z] of highlight.ranges) {
          if (a >= map.length - 1) continue;
          const from = map[a], to = (map[Math.min(z, map.length - 1) - 1] ?? from) + 1;
          if (to > from) decos.push(Decoration.inline(from, to, { class: 'hit', nodeName: 'mark' }));
        }
      }
    }
    if (ghost) {
      const pos = Math.max(0, Math.min(ghost.pos, state.doc.content.size));
      const key = 'g' + ghost.segs.map((s) => (s.caret ? '|' : `${s.cls ?? ''}:${s.t}`)).join('\u0001');
      decos.push(Decoration.widget(pos, () => ghostDom(ghost.segs), { side: 1, key, ignoreSelection: true }));
    }
    view.dispatch(state.tr.setMeta(decoKey, DecorationSet.create(state.doc, decos)).setMeta('addToHistory', false));
    if (foundPos !== null) {
      const el = view.nodeDOM(foundPos) as HTMLElement | null;
      const sc = el?.closest('.ed-scroll') as HTMLElement | null;
      if (el && sc) {
        const y = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
        sc.scrollTo({ top: Math.max(0, y - sc.clientHeight / 4), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    }
  }, [editor, highlight, ghost]);

  // Selection: the floating bar and the "move to chapter" passage.
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (editor.isDestroyed) return;
      const { state, view } = editor;
      const { from, to, empty } = state.selection;
      const focused = view.hasFocus() || !!wrapRef.current?.querySelector('.ed-bubble')?.contains(document.activeElement);
      if (empty || !editor.isEditable || !focused) {
        setBubble(null);
        if (empty || !editor.isEditable) selRef.current?.(null);
        return;
      }
      const text = state.doc.textBetween(from, to, '\n');
      if (!text.trim()) { setBubble(null); selRef.current?.(null); return; }
      const wrap = wrapRef.current;
      if (wrap) {
        const w = wrap.getBoundingClientRect();
        // The browser's own selection box is the most reliable place to anchor to.
        const ds = window.getSelection();
        let box: { top: number; left: number; right: number } | null = null;
        if (ds && ds.rangeCount && view.dom.contains(ds.anchorNode)) {
          const rects = Array.from(ds.getRangeAt(0).getClientRects()).filter((r) => r.width > 0);
          if (rects.length) {
            const top = Math.min(...rects.map((r) => r.top));
            const firstLine = rects.filter((r) => r.top - top < 4);
            box = { top, left: Math.min(...firstLine.map((r) => r.left)), right: Math.max(...firstLine.map((r) => r.right)) };
          }
        }
        if (!box) {
          const a = view.coordsAtPos(from, 1), z = view.coordsAtPos(to, -1);
          box = a.top === z.top ? { top: a.top, left: a.left, right: z.left } : { top: a.top, left: a.left, right: a.left + 1 };
        }
        const left = (box.left + box.right) / 2 - w.left;
        setBubble({ top: box.top - w.top, left: Math.max(175, Math.min(w.width - 175, left)) });
      }
      const sel = sliceToMd(state.doc, from, to);
      selRef.current?.({ from, to, md: sel, words: countWords(toPlain(sel)) });
    };
    const onBlur = () => setTimeout(update, 120);
    editor.on('selectionUpdate', update);
    editor.on('focus', update);
    editor.on('blur', onBlur);
    return () => { editor.off('selectionUpdate', update); editor.off('focus', update); editor.off('blur', onBlur); };
  }, [editor]);

  const focusAt = useCallback((target?: CaretTarget) => {
    if (!editor) return;
    const doc = editor.state.doc;
    let pos: number;
    if (target === undefined) pos = editor.state.selection.head;
    else if (target === 'end') pos = doc.content.size - 1;
    else if (typeof target === 'number') pos = target;
    else {
      const b = writtenBlocks(doc)[ordinalOf(lastMd.current, target.block)];
      if (!b) pos = target.at === 'start' ? 1 : doc.content.size - 1;
      else { const e = textEnds(b.node, b.pos); pos = target.at === 'start' ? e.start : e.end; }
    }
    pos = Math.max(1, Math.min(pos, doc.content.size - 1));
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(pos).run();
    const sc = (editor.view.dom as HTMLElement).closest('.ed-scroll') as HTMLElement | null;
    if (sc) {
      try {
        const c = editor.view.coordsAtPos(pos);
        const r = sc.getBoundingClientRect();
        if (c.top < r.top + 60 || c.bottom > r.bottom - 40) sc.scrollTo({ top: Math.max(0, sc.scrollTop + c.top - r.top - sc.clientHeight / 3) });
      } catch { /* not laid out yet */ }
    }
  }, [editor]);

  useImperativeHandle(ref, () => ({
    editor,
    focusAt,
    caret: () => editor?.state.selection.head ?? 0,
    context: (pos: number) => {
      if (!editor) return { before: '', after: '' };
      const $p = editor.state.doc.resolve(Math.max(0, Math.min(pos, editor.state.doc.content.size)));
      const parent = $p.parent;
      if (!parent.isTextblock) return { before: '', after: '' };
      return {
        before: parent.textBetween(0, $p.parentOffset, '\n', '\n'),
        after: parent.textBetween($p.parentOffset, parent.content.size, '\n', '\n'),
      };
    },
    insertPlain: (pos: number, text: string) => {
      if (!editor) return pos;
      const { state } = editor;
      const { schema } = state;
      const tr = state.tr;
      let p = Math.max(1, Math.min(pos, state.doc.content.size - 1));
      let $p = tr.doc.resolve(p);
      if (!$p.parent.isTextblock) {
        // Caret between blocks (e.g. after a scene break): start a paragraph there.
        tr.insert(p, schema.nodes.paragraph.create());
        p += 1;
        $p = tr.doc.resolve(p);
      }
      const inItem = $p.depth >= 2 && $p.node($p.depth - 1).type.name === 'listItem';
      const parts = text.split(/\n{2,}/);
      parts.forEach((part, i) => {
        if (i > 0) {
          const parentType = tr.doc.resolve(p).parent.type.name;
          if (inItem) { tr.split(p, 2); p += 4; }
          else { tr.split(p, 1, parentType === 'heading' || parentType === 'quote' ? [{ type: schema.nodes.paragraph }] : undefined); p += 2; }
        }
        part.split('\n').forEach((line, j) => {
          if (j > 0) { tr.insert(p, schema.nodes.hardBreak.create()); p += 1; }
          if (line) { tr.insert(p, schema.text(line)); p += line.length; }
        });
      });
      silent.current = true;
      try {
        editor.view.dispatch(tr);
        lastMd.current = docToMd(editor.state.doc);
      } finally { silent.current = false; }
      return p;
    },
    deleteSelection: () => {
      if (!editor) return lastMd.current;
      silent.current = true;
      try {
        editor.chain().focus(undefined, { scrollIntoView: false }).deleteSelection().run();
        lastMd.current = docToMd(editor.state.doc);
      } finally { silent.current = false; }
      return lastMd.current;
    },
    md: () => (editor ? docToMd(editor.state.doc) : lastMd.current),
    blockAt: (pos: number) => {
      if (!editor) return 0;
      const blocks = writtenBlocks(editor.state.doc);
      let ord = 0;
      blocks.forEach((b, i) => { if (b.pos <= pos) ord = i; });
      return indexOfOrdinal(lastMd.current, ord);
    },
  }), [editor, focusAt]);

  const keep = (e: React.MouseEvent) => e.preventDefault();
  const mark = (name: 'bold' | 'italic' | 'underline' | 'highlight') => {
    if (!editor) return;
    const c = editor.chain().focus();
    if (name === 'bold') c.toggleBold().run();
    else if (name === 'italic') c.toggleItalic().run();
    else if (name === 'underline') c.toggleUnderline().run();
    else c.toggleHighlight().run();
    setBubble((b) => (b ? { ...b } : b));
  };

  return (
    <div className="ed-rt" ref={wrapRef}>
      <EditorContent editor={editor} />
      {bubble && editor && editable && (
        <div className="ed-bubble" role="toolbar" aria-label={t('tb.bubble')} style={{ top: bubble.top, left: bubble.left }} onMouseDown={keep}>
          {(['bold', 'italic', 'underline', 'highlight'] as const).map((m) => (
            <button key={m} type="button" className="ed-bubble-btn" aria-pressed={editor.isActive(m)} aria-label={t(`tb.${m}`)} title={t(`tb.${m}`)} onMouseDown={keep} onClick={() => mark(m)}>
              <ToolIcon name={m} />
            </button>
          ))}
          {onMoveSelection && (
            <>
              <span className="ed-bubble-sep" aria-hidden="true" />
              <button type="button" className="ed-bubble-move" onMouseDown={keep} onClick={onMoveSelection}>
                <ToolIcon name="move" />{t('tb.moveTo')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});
