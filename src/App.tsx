import {StudioStatus} from './components/StudioStatus';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider, useLang } from './i18n';
import { ToastProvider } from './components/Toast';
import { CaptureProvider } from './app/CaptureLap';
import { AppLayout } from './app/AppLayout';
import { BookProvider, bookPath, useCurrentBook } from './app/context';
import { TabRoute } from './app/TabRoute';
import { useProfile } from './data/hooks';
import type { AppLang } from './data/types';

const Landing = lazy(() => import('./screens/landing/Landing'));
const Onboarding = lazy(() => import('./screens/onboarding/Onboarding'));
const Library = lazy(() => import('./screens/app/Library'));
const Editor = lazy(() => import('./screens/app/Editor'));
const Laps = lazy(() => import('./screens/app/Laps'));
const History = lazy(() => import('./screens/app/History'));
const Settings = lazy(() => import('./screens/app/Settings'));
const Founder=lazy(()=>import('./screens/Founder'));
const NotFound = lazy(() => import('./screens/NotFound'));

function Loading() {
  return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)' }} aria-busy="true">…</div>;
}

/** Marketing pages pick their language from the URL: / is English, /hi is Hindi. */
function LandingRoute({ lang }: { lang: AppLang }) {
  const { lang: current, setLang } = useLang();
  useEffect(() => { setLang(lang); }, [lang, setLang]);
  // Render only once the i18n language matches the URL, so copy never flashes in the wrong language.
  if (current !== lang) return <Loading />;
  return <Landing lang={lang} />;
}

/** The app needs a finished onboarding; otherwise start there. */
function Gate({ children }: { children: ReactNode }) {
  const { data: profile, loading } = useProfile();
  const loc = useLocation();
  if (loading || !profile) return <Loading />;
  if (!profile.onboarded) return <Navigate to="/start" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function AppIndex() {
  const { data: profile } = useProfile();
  if (!profile) return <Loading />;
  return <Navigate to={profile.currentBookId ? `/app/b/${profile.currentBookId}` : '/app/library'} replace />;
}

/**
 * Opening a book lands where the author left off:
 * chapters with words → the most recently touched of those chapters' desk;
 * chapters planned but empty → the Chapters outline; no chapters yet → the Manuscript (write first, sort later).
 */
function BookIndex() {
  const { book, chapters, loading } = useCurrentBook();
  if (!book) return loading ? <Loading /> : <Navigate to="/app/library" replace />;
  if (loading) return <Loading />;
  const written = chapters.filter((c) => c.wordCount > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (written.length) return <Navigate to={bookPath(book.id, 'write', written[0].id)} replace />;
  return <Navigate to={bookPath(book.id, chapters.length ? 'chapters' : 'manuscript')} replace />;
}

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <CaptureProvider>
          <StudioStatus/>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<LandingRoute lang="en" />} />
              <Route path="/hi" element={<LandingRoute lang="hi" />} />
              <Route path="/founder" element={<Founder/>}/>
              <Route path="/start" element={<Onboarding />} />
              <Route path="/app" element={<Gate><AppLayout /></Gate>}>
                <Route index element={<AppIndex />} />
                <Route path="library" element={<Library />} />
                <Route path="laps" element={<Laps />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="/app/b/:bookId" element={<Gate><BookProvider><AppLayout /></BookProvider></Gate>}>
                <Route index element={<BookIndex />} />
                <Route path="write" element={<Editor />} />
                <Route path="write/:chapterId" element={<Editor />} />
                <Route path="history" element={<History />} />
                <Route path=":tab" element={<TabRoute />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </CaptureProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
