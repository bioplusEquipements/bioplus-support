import { useState, type FormEvent } from 'react';
import { Navigate, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import Spinner from '../components/Spinner';
import Logo from '../components/Logo';

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  if (loading) return <Spinner label="Chargement..." />;

  if (user) return <Navigate to={redirect} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setResetBusy(true);
    setResetMsg(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/login`
    });
    setResetBusy(false);
    if (err) {
      setResetMsg(err.message);
    } else {
      setResetSent(true);
    }
  }

  return (
    <div className="auth-bg">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />

      <div className="relative mb-8 flex flex-col items-center">
        <Logo size={64} className="drop-shadow-lg" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">BioPlus Support</h1>
        <p className="mt-1 text-sm font-medium text-teal-100">
          Support technique — automates Horiba ABX
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-card relative space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="technicien@laboratoire.tn"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => { setShowReset(true); setResetEmail(email); }}
            className="mt-1 text-xs text-teal-200/80 hover:text-white"
          >
            Mot de passe oublié ?
          </button>
        </div>

        {params.get('expired') === '1' && (
          <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800">
            Session expirée : votre mot de passe a peut-être été réinitialisé.
            Reconnectez-vous avec votre mot de passe actuel.
          </p>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
          {submitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>

      <p className="relative mt-6 text-center text-xs text-teal-100/70">
        Accès réservé au personnel BioPlus et aux laboratoires partenaires.
      </p>
      <p className="relative mt-2 text-center text-xs text-white">
        Votre laboratoire n'est pas encore inscrit ?{' '}
        <Link to="/register" className="font-bold underline underline-offset-2 hover:text-teal-200">
          S'inscrire via le QR code
        </Link>
      </p>

      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card relative w-full max-w-sm space-y-3">
            <button
              type="button"
              onClick={() => { setShowReset(false); setResetSent(false); setResetMsg(null); }}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
            {resetSent ? (
              <>
                <h2 className="text-base font-bold text-slate-900">Email envoyé</h2>
                <p className="text-sm text-slate-600">
                  Vérifiez votre boîte de réception et cliquez sur le lien pour réinitialiser votre mot de passe.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowReset(false); setResetSent(false); }}
                  className="btn-primary w-full"
                >
                  Retour à la connexion
                </button>
              </>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <h2 className="text-base font-bold text-slate-900">Réinitialiser le mot de passe</h2>
                <p className="text-sm text-slate-600">
                  Entrez votre adresse email pour recevoir un lien de réinitialisation.
                </p>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="input w-full"
                  placeholder="votre@email.tn"
                />
                {resetMsg && <p className="text-sm text-red-600">{resetMsg}</p>}
                <button type="submit" disabled={resetBusy} className="btn-primary w-full">
                  {resetBusy ? 'Envoi...' : 'Envoyer le lien'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
