import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabaseClient';

/**
 * Vide TOUS les caches du Service Worker (précache + caches dynamiques API/photos).
 * Appelé au logout pour qu'aucune donnée d'un utilisateur A ne persiste
 * pour l'utilisateur B sur le même appareil.
 */
export async function clearAllCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith('bioplus-') || name.startsWith('workbox-'))
      .map((name) => caches.delete(name))
  );
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
      } else {
        supabase.from('profiles').select('*').eq('user_id', nextSession.user.id).maybeSingle().then(({ data }) => setProfile(data as Profile | null));
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    const fetchProfile = () => supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle().then(({ data }) => setProfile(data as Profile | null));
    fetchProfile();

    // Realtime subscription: refetch profile when it changes in the database
    const channel = supabase
      .channel('profile-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: 'user_id=eq.' + session.user.id
      }, fetchProfile)
      .subscribe();

    // Polling fallback: refetch every 30 seconds in case Realtime is not configured
    const pollInterval = setInterval(fetchProfile, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [session?.user?.id]);

  async function signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    await clearAllCaches();
  }

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, profile, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}