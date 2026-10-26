import Editor from '@/screens/app/Editor';

/**
 * Manuscript: write first, sort later. One long page bound to the book's free-writing draft
 * (api.chapters.draft), with the same desk as a chapter: dictation, spoken changes, autosave
 * and versions. Select a passage to move or copy it into a chapter (or a new one).
 */
export default function Page() {
  return <Editor mode="draft" />;
}
