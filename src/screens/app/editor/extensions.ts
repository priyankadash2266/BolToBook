/**
 * The writing desk's editor schema: exactly what the chapter Markdown can hold (see `@/lib/markdown`).
 * Body · Heading · Subheading · Quote · bulleted/numbered lists (one nested level) · scene break ·
 * bold, italic, underline, strike, highlight · alignment.
 */
import { Extension, Node, mergeAttributes, textblockTypeInputRule, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extensions';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';

/** A quoted passage: one block of text, set in from both sides. */
export const Quote = Node.create({
  name: 'quote',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'blockquote' }]; },
  renderHTML({ HTMLAttributes }) { return ['blockquote', mergeAttributes(HTMLAttributes, { class: 'ed-quote' }), 0]; },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-9': () => this.editor.commands.toggleNode('quote', 'paragraph') };
  },
  addInputRules() {
    return [textblockTypeInputRule({ find: /^>\s$/, type: this.type })];
  },
});

/** How many lists the caret is inside. */
export function listDepth(editor: Editor): number {
  const $f = editor.state.selection.$from;
  let n = 0;
  for (let d = $f.depth; d > 0; d--) {
    const t = $f.node(d).type.name;
    if (t === 'bulletList' || t === 'orderedList') n++;
  }
  return n;
}

export const canIndent = (editor: Editor) => listDepth(editor) === 1 && editor.can().sinkListItem('listItem');
export const canOutdent = (editor: Editor) => listDepth(editor) >= 1 && editor.can().liftListItem('listItem');

/** Clears inline marks and turns the block back into body text. */
export function clearFormatting(editor: Editor) {
  return editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run();
}

/** Desk shortcuts on top of the defaults (Mod-B/I/U, Mod-Shift-S/H/7/8, Mod-Alt-2/3, Mod-Shift-L/E/R/J, Mod-Z/Mod-Shift-Z). */
export const DeskKeys = Extension.create({
  name: 'deskKeys',
  priority: 200,
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-0': () => this.editor.commands.setParagraph(),
      'Mod-Shift-Enter': () => this.editor.chain().focus().setHorizontalRule().run(),
      'Mod-\\': () => clearFormatting(this.editor),
      // One level of nesting is all a book list needs.
      Tab: () => {
        if (!listDepth(this.editor)) return false;
        if (canIndent(this.editor)) return this.editor.commands.sinkListItem('listItem');
        return true;
      },
    };
  },
});

/** Decorations owned by the desk (found words, the live dictation), set from React. */
export const decoKey = new PluginKey<DecorationSet>('edDeco');
export const DeskDecorations = Extension.create({
  name: 'deskDecorations',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: decoKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, old) {
          const next = tr.getMeta(decoKey) as DecorationSet | undefined;
          return next ?? old.map(tr.mapping, tr.doc);
        },
      },
      props: { decorations(state) { return decoKey.getState(state); } },
    })];
  },
});

export function deskExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      link: false,
      heading: { levels: [2, 3] },
      horizontalRule: { HTMLAttributes: { class: 'ed-break' } },
    }),
    Quote,
    TextAlign.configure({ types: ['heading', 'paragraph', 'quote'], alignments: ['left', 'center', 'right', 'justify'] }),
    Highlight.configure({ multicolor: false }),
    Placeholder.configure({ placeholder, showOnlyWhenEditable: false }),
    DeskKeys,
    DeskDecorations,
  ];
}
