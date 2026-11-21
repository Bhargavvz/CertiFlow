import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, homePathFor, useAuth } from './auth';
import { SkeletonBlock } from './components/Feedback';
import { AppShell } from './components/shell/AppShell';
import { I18nProvider } from './i18n';

// Each page is its own chunk: the public verify page (opened from WhatsApp on a
// phone) never downloads the officer screens or the chart library.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CentreDashboard = lazy(() => import('./pages/centre/CentreDashboard'));
const BatchesPage = lazy(() => import('./pages/BatchesPage'));
const NewBatchPage = lazy(() => import('./pages/centre/NewBatchPage'));
const PreparePage = lazy(() => import('./pages/centre/PreparePage'));
const BatchDetailPage = lazy(() => import('./pages/review/BatchDetailPage'));
const QueuePage = lazy(() => import('./pages/review/QueuePage'));
const OverviewPage = lazy(() => import('./pages/state/OverviewPage'));
const StuckPage = lazy(() => import('./pages/state/StuckPage'));
const CertificatesPage = lazy(() => import('./pages/state/CertificatesPage'));
const DeliveriesPage = lazy(() => import('./pages/state/DeliveriesPage'));
const VerifyPage = lazy(() => import('./pages/public/VerifyPage'));
const CandidatePage = lazy(() => import('./pages/public/CandidatePage'));
const PhonePage = lazy(() => import('./pages/public/PhonePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user) : '/login'} replace />;
}

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl p-6">
          <SkeletonBlock lines={4} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function Public({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <Page>{children}</Page>
    </I18nProvider>
  );
}

export function App() {
  return (
    <Routes>
      {/* Public, no login */}
      <Route path="/verify" element={<Public><VerifyPage /></Public>} />
      <Route path="/verify/:number" element={<Public><VerifyPage /></Public>} />
      <Route path="/c/:token" element={<Public><CandidatePage /></Public>} />
      <Route path="/phone" element={<Page><PhonePage /></Page>} />
      <Route path="/login" element={<Page><LoginPage /></Page>} />

      {/* Signed in */}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Page><CentreDashboard /></Page>} />
        <Route path="/batches" element={<Page><BatchesPage /></Page>} />
        <Route path="/batches/new" element={<Page><NewBatchPage /></Page>} />
        <Route path="/batches/:id" element={<Page><BatchDetailPage /></Page>} />
        <Route path="/batches/:id/prepare" element={<Page><PreparePage /></Page>} />
        <Route path="/queue" element={<Page><QueuePage /></Page>} />
        <Route path="/overview" element={<Page><OverviewPage /></Page>} />
        <Route path="/stuck" element={<Page><StuckPage /></Page>} />
        <Route path="/certificates" element={<Page><CertificatesPage /></Page>} />
        <Route path="/deliveries" element={<Page><DeliveriesPage /></Page>} />
        <Route path="*" element={<Page><NotFoundPage /></Page>} />
      </Route>
    </Routes>
  );
}
