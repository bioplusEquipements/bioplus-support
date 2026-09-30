import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { edge } from '../lib/edge';
import { useAuth } from '../contexts/AuthContext';
import Spinner from '../components/Spinner';

interface Recipient {
  id: string;
  email: string;
  statut: 'en_attente' | 'valide';
  created_by_email: string;
  created_at: string;
  validated_at: string | null;
}

export default function Alarms() {
  const { profile } = useAuth();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');

  const isSuper = profile?.is_super_admin === true;

  async function refresh() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await edge<{ recipients: Recipient[] }>('alarm-recipients', {
      action: 'list'
    });
    setLoading(false);
    if (err) setError(err.message);
    else setRecipients(data?.recipients ?? []);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await edge('alarm-recipients', { action: 'add', email });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setEmail('');
      refresh();
    }
  }

  async function act(r: Recipient, action: 'validate' | 'refuser' | 'delete') {
    const labels: Record<string, string> = {
      validate: `Valider ${r.email} comme destinataire des alarmes ?`,
      refuser: `Refuser la proposition de ${r.email} ?`,
      delete: `Retirer définitivement ${r.email} des destinataires ?`
    };
    if (!window.confirm(labels[action])) return;
    setBusy(true);
    setError(null);
    const { error: err } = await edge('alarm-recipients', { action, id: r.id });
    setBusy(false);
    if (err) setError(err.message);
    else refresh();
  }

  if (loading && recipients.length === 0)
    return <Spinner label="Chargement des alertes par email..." />;

  const enAttente = recipients.filter((r) => r.statut === 'en_attente').length;
  const valides = recipients.filter((r) => r.statut === 'valide').length;

  return (
    <div className="flex flex-col">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 page-title">Alertes par email</h1>
          <p className="text-xs text-slate-500">
            Alarmes critiques envoyées par email · validation par m.dababi
          </p>
        </div>
        <Link to="/dashboard" className="btn-outline px-3 py-1.5 text-xs">
          Tableau de bord
        </Link>
      </header>

      <div className="card mb-3 border-teal-200 bg-teal-50/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 text-sm font-bold text-white">
            MD
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              m.dababi · Destinataire principal
            </p>
            <p className="text-xs text-slate-600">
              Reçoit TOUTES les alarmes critiques — vous ne pouvez pas le retirer.
            </p>
          </div>
          <span className="badge shrink-0 bg-teal-600 text-white">TOP</span>
        </div>
      </div>

      <div className="card mb-3">
        <p className="mb-1 text-sm font-semibold text-slate-900">
          {valides} destinataire(s) validé(s) · {enAttente} en attente
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Toute réclamation de priorité CRITIQUE déclenche un email d'alarme à m.dababi et à tous
          les destinataires validés.
        </p>
        <form onSubmit={propose} className="flex gap-2">
          <input
            type="email"
            required
            placeholder="email@laboratoire.tn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input flex-1 text-sm"
          />
          <button type="submit" disabled={busy || !email.trim()} className="btn-primary shrink-0">
            {busy ? '...' : 'Proposer'}
          </button>
        </form>
        {!isSuper && (
          <p className="mt-2 text-[11px] text-amber-700">
            Votre proposition sera envoyée à m.dababi pour validation avant activation.
          </p>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {recipients.length === 0 ? (
        <div className="card bg-slate-100 text-center">
          <p className="text-sm text-slate-500">
            Aucun destinataire ajouté. Proposez un email ci-dessus.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {recipients.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">{r.email}</p>
                {r.statut === 'valide' ? (
                  <span className="badge shrink-0 bg-green-100 text-green-800">
                    Validé par m.dababi
                  </span>
                ) : (
                  <span className="badge shrink-0 bg-amber-100 text-amber-800">
                    En attente de validation
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Proposé par {r.created_by_email || '—'} ·{' '}
                {new Date(r.created_at).toLocaleDateString('fr-FR')}
                {r.validated_at
                  ? ` · validé le ${new Date(r.validated_at).toLocaleDateString('fr-FR')}`
                  : ''}
              </p>
              {isSuper && (
                <div className="mt-2 flex gap-2">
                  {r.statut !== 'valide' && (
                    <button
                      onClick={() => act(r, 'validate')}
                      disabled={busy}
                      className="btn-primary px-2 py-1 text-xs"
                    >
                      Valider
                    </button>
                  )}
                  {r.statut !== 'valide' && (
                    <button
                      onClick={() => act(r, 'refuser')}
                      disabled={busy}
                      className="btn-outline border-red-200 text-red-600 px-2 py-1 text-xs"
                    >
                      Refuser
                    </button>
                  )}
                  <button
                    onClick={() => act(r, 'delete')}
                    disabled={busy}
                    className="btn-outline border-red-200 text-red-600 px-2 py-1 text-xs"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link to="/dashboard" className="btn-outline mt-4 w-full">
        Tableau de bord
      </Link>
    </div>
  );
}