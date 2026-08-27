import { Navigate, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/store/useStore';

/**
 * Replaces the `if (!session) redirect('/login')` that every dashboard route
 * inherited from the Next.js layout. Same effect: no signed-in user, no
 * dashboard.
 *
 * This is a DEMO gate, not security. The whole dataset lives in the visitor's
 * own browser, so this only decides what the UI shows — it protects nothing.
 * Real route protection needs the server-side session the original defers to
 * Supabase Auth.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useCurrentUser();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
