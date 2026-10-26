import {api} from '@/data/api';
import { useToast } from '@/components/Toast';
import { useCharge } from '@/components/credits';
import type { Book } from '@/data/types';
import { useT } from '@/i18n';
import { openPrintWindow } from '@/lib/exporters';
import type { PrintLabels } from '@/lib/paginate';
import { runExport } from './previewJobs';
import { useVariantNames } from './Chooser';
import type { Variant } from './variants';

export const exportKindOf = (v: Pick<Variant, 'size'>): 'pdf' | 'epub' => (v.size === 'ebook' ? 'epub' : 'pdf');

/** Export one kept preview as a file (paid): PDF for a print size, EPUB for the eBook. */
export function useExport(book: Book, labels: PrintLabels) {
  const t = useT('finish');
  const tc = useT('common');
  const toast = useToast();
  const charge = useCharge();
  const { label } = useVariantNames();
  return async (v: Variant) => {
    const kind = exportKindOf(v);
    // The print window must open straight from the click, before anything is awaited.
    const win = kind === 'pdf' ? openPrintWindow(t('gen.pdf.preparing')) : null;
    if (kind === 'pdf' && !win) { toast.show(t('gen.pdf.blocked')); return; }
    const ok = await charge({ kind: 'export', units: 1, bookId: book.id, ref: v.id, note: t('pv.noteExport', { kind: kind.toUpperCase(), label: label(v.size, v.style), title: book.title || tc('untitled') }) });
    if (!ok) { win?.close(); return; }
    try {
      await runExport(kind, v, { book, labels, pdfText: { instructions: t('gen.pdf.instructions'), printLabel: t('gen.pdf.button') } }, win);
      toast.show(t(kind === 'pdf' ? 'pv.pdfReady' : 'pv.epubReady'));
    } catch { win?.close(); const prices=await api.billing.prices(); await api.billing.topUp(prices.export,'Unsuccessful export — beta credits returned'); toast.show(t('failed')); }
  };
}
