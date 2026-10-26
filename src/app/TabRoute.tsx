import { Navigate, useParams } from 'react-router-dom';
import { useCurrentBook, bookPath } from './context';
import { TAB_PAGES } from './lifecycle';
import NotFound from '@/screens/NotFound';
import { PageBoundary } from './PageBoundary';

/** Renders a workspace tab (/app/b/:bookId/:tab). Old or unknown section URLs land on the manuscript. */
export function TabRoute() {
  const { tab = '' } = useParams();
  const { book, loading } = useCurrentBook();
  if (!book) return loading ? null : <NotFound />;
  const Page = TAB_PAGES[tab];
  if (!Page) return <Navigate to={bookPath(book.id, 'write')} replace />;
  return <PageBoundary resetKey={tab}><Page key={tab} /></PageBoundary>;
}
