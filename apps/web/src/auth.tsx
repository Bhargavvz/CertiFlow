import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError, api } from './api';
import type { AuthUser } from './types';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login(userKey: string): Promise<AuthUser>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: AuthUser }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // Switching user must drop the previous user's cached data, but NOT the 'me' query
  // itself: this provider is subscribed to it, and qc.clear() would orphan that
  // subscription so the new user never reached the UI.
  const switchUser = (user: AuthUser | null) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], user);
  };

  const value: AuthState = {
    user: me.data ?? null,
    loading: me.isLoading,
    async login(userKey) {
      const { user } = await api<{ user: AuthUser }>('/auth/demo-login', { method: 'POST', json: { userKey } });
      switchUser(user);
      return user;
    },
    async logout() {
      await api('/auth/logout', { method: 'POST' });
      switchUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="page">Loading...</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export function homePathFor(user: AuthUser): string {
  return user.role === 'CENTRE' ? '/batches' : '/queue';
}
