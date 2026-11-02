import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput } from '@dhaaga/shared';
import { api } from '@/lib/api';
import type { SessionUser } from '@/lib/types';

export const ME_KEY = ['auth', 'me'] as const;

export function useAuth() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => (await api.get<{ user: SessionUser | null }>('/auth/me')).user,
    staleTime: 60_000,
    retry: 1,
  });

  const onSession = (user: SessionUser) => {
    qc.setQueryData(ME_KEY, user);
    // Anything user-specific must be refetched for the new session.
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' && q.queryKey[0] !== 'categories' });
  };

  const login = useMutation({
    mutationFn: (input: LoginInput) => api.post<{ user: SessionUser }>('/auth/login', input),
    onSuccess: ({ user }) => onSession(user),
  });
  const register = useMutation({
    mutationFn: (input: RegisterInput) => api.post<{ user: SessionUser }>('/auth/register', input),
    onSuccess: ({ user }) => onSession(user),
  });
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' && q.queryKey[0] !== 'categories' && q.queryKey[0] !== 'products' });
    },
  });

  const user = me.data ?? null;
  return {
    user,
    isLoading: me.isLoading,
    isAuthenticated: !!user,
    isRetailer: user?.role === 'RETAILER',
    isSupplier: user?.role === 'SUPPLIER',
    isAdmin: user?.role === 'ADMIN',
    login,
    register,
    logout,
  };
}

/** Where a user lands by default after signing in. */
export function homeFor(user: SessionUser | null) {
  if (!user) return '/';
  if (user.role === 'ADMIN') return '/admin';
  if (user.role === 'SUPPLIER') return '/supplier';
  return '/account';
}
