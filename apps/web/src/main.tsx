import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ApiError } from './api';
import { App } from './App';
import { AuthProvider } from './auth';
import { TooltipProvider } from './components/ui/overlays';
import { ThemeProvider, useTheme } from './design/theme';
import './design/tokens.css';
import './legacy.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live updates come from the websocket, so no aggressive polling or refocus storms.
      refetchOnWindowFocus: false,
      staleTime: 5_000,
      // Don't retry what won't change: permission, not-found, validation or rate limits.
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
});

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" closeButton richColors={false} toastOptions={{ className: 'font-sans' }} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
