import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';

export default function Register() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    password_confirm: '',
    laboratoire_nom: '',
    laboratoire_ville: '',
    laboratoire_adresse: '',
    laboratoire_telephone: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (form.password !== form.password_confirm) {
      setError('Les mots de passe ne correspondent pas.');
      setBusy(false);
      return;
    }
    const { error: err } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          statut: 'en_attente',
          full_name: form.full_name.trim(),
          laboratoire_nom: form.laboratoire_nom.trim(),
          laboratoire_ville: form.laboratoire_ville.trim(),
          laboratoire_adresse: form.laboratoire_adresse.trim(),
          laboratoire_telephone: form.laboratoire_telephone.trim()
        }
      }
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setCreated(true);
  }

  if (created) {
    return (
      <div className="auth-bg">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="card relative w-full max-w-md text-center">
          <Logo size={48} className="mx-auto" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">Compte en attente de validation</h1>
          <p className="mt-2 text-sm text-slate-600">
            Votre demande d'inscription a bien été reçue. L'administration BioPlus doit valider votre laboratoire avant l'activation de votre accès.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Contact : support@bioplus.tn · +216 71 000 000
          </p>
          <Link to="/login" className="btn-primary mt-4 w-full">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-bg">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative mb-6 flex flex-col items-center">
        <Logo size={56} className="drop-shadow-lg" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">BioPlus Support</h1>
        <p className="text-xs font-medium text-teal-100">
          Inscription de votre laboratoire — validation par BioPlus
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-card relative space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div>
          <label className="label">Votre nom complet</label>
          <input
            required
            placeholder="Dr Sonia Ben Ali"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Email du compte</label>
          <input
            type="email"
            required
            placeholder="contact@mon-laboratoire.tn"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Mot de passe (6 caractères min)</label>
          <input
            type="password"
            required
            minLength={6}
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Confirmer le mot de passe</label>
          <input
            type="password"
            required
            minLength={6}
            placeholder="••••••••"
            value={form.password_confirm}
            onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Nom du laboratoire</label>
          <input
            required
            placeholder="Laboratoire Clinique Al Manar"
            value={form.laboratoire_nom}
            onChange={(e) => setForm({ ...form, laboratoire_nom: e.target.value })}
            className="input w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Ville</label>
            <input
              placeholder="Tunis"
              value={form.laboratoire_ville}
              onChange={(e) => setForm({ ...form, laboratoire_ville: e.target.value })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input
              placeholder="+216 71 000 000"
              value={form.laboratoire_telephone}
              onChange={(e) => setForm({ ...form, laboratoire_telephone: e.target.value })}
              className="input w-full"
            />
          </div>
        </div>
        <div>
          <label className="label">Adresse</label>
          <input
            placeholder="12 rue des Oliviers"
            value={form.laboratoire_adresse}
            onChange={(e) => setForm({ ...form, laboratoire_adresse: e.target.value })}
            className="input w-full"
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Envoi de la demande...' : 'Créer mon compte (demande de validation)'}
        </button>
        <p className="text-center text-xs text-slate-500">
          Déjà un compte ?{' '}
          <Link to="/login" className="font-semibold text-teal-700">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  );
}