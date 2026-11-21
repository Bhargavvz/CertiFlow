import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, homePathFor, useAuth } from './auth';
import { Layout } from './components/Layout';
import { BatchDetailPage } from './pages/BatchDetailPage';
import { BatchListPage } from './pages/BatchListPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { LoginPage } from './pages/LoginPage';
import { PhonePage } from './pages/PhonePage';
import { QueuePage } from './pages/QueuePage';
import { StuckPage } from './pages/StuckPage';
import { VerifyPage } from './pages/VerifyPage';

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user) : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      {/* Public, no login */}
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/verify/:number" element={<VerifyPage />} />
      <Route path="/phone" element={<PhonePage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Signed in */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/batches" element={<BatchListPage />} />
        <Route path="/batches/:id" element={<BatchDetailPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/stuck" element={<StuckPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
