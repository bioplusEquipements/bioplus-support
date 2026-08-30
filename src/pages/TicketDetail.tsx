import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  supabase,
  type Intervention,
  type Statut,
  type TicketWithAutomate
} from '../lib/supabaseClient';
import { STATUT_STYLES, PRIORITE_STYLES } from '../lib/styles';
import { useAuth } from '../contexts/AuthContext';
import { useGalacticos } from '../hooks/useGalacticos';
import Spinner from '../components/Spinner';
import IncidentEvent from './IncidentEvent';

export default function TicketDetail() {
  const isGalacticos = useGalacticos();
  return isGalacticos ? <IncidentEvent /> : <ClassicTicketDetail />;
}

function ClassicTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [ticket, setTicket] = useState<TicketWithAutomate | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [statut, setStatut] = useState<Statut>('ouvert');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [interventionText, setInterventionText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('Identifiant de ticket manquant.');
      setLoading(false);
      return;
    }
    supabase
      .from('tickets')
      .select('*, automates(id, nom, modele)')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data, error: err }) => {
        if (err || !data) {
          setError('Ticket introuvable ou accès refusé (hors de votre laboratoire).');
          setLoading(false);
          return;
        }
        const t = data as TicketWithAutomate;
        setTicket(t);
        setStatut(t.statut);
        if (t.photo_path) {
          const { data: signed, error: signErr } = await supabase.storage
            .from('photos')
            .createSignedUrl(t.photo_path, 3600);
          if (signed) setPhotoUrl(signed.signedUrl);
          else setPhotoError(signErr?.message ?? 'Objet photo introuvable');
        }
        setLoading(false);
      });
  }, [id]);

  async function loadInterventions() {
    if (!id) return;
    const { data, error: err } = await supabase
      .from('interventions')
      .select('*, profiles(full_name)')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });
    if (!err && data) setInterventions(data as Intervention[]);
  }

  useEffect(() => {
    loadInterventions();
    const timer = setInterval(loadInterventions, 30000);
    return () => clearInterval(timer);
  }, [id]);

  async function handlePostIntervention(e: FormEvent) {
    e.preventDefault();
    if (!id || !interventionText.trim()) return;
    setPosting(true);
    setError(null);
    const { error: err } = await supabase.from('interventions').insert({
      ticket_id: id,
      message: interventionText.trim()
    });
    setPosting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setInterventionText('');
    loadInterventions();
  }

  async function handleSaveStatut() {
    if (!ticket) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from('tickets')
      .update({ statut, updated_at: now })
      .eq('id', ticket.id);
    setSaving(false);
    if (upErr) {
      setError(upErr.message);
    } else {
      setSaved(true);
      setTicket({ ...ticket, statut, updated_at: now });
    }
  }

  async function removeTicket() {
    if (!ticket) return;
    if (!window.confirm('Supprimer définitivement cette réclamation ?')) return;
    if (!window.confirm('Confirmer la suppression IRREVERSIBLE de cette réclamation ?')) return;
    setError(null);
    const { error: delErr } = await supabase.from('tickets').delete().eq('id', ticket.id);
    if (delErr) setError(delErr.message);
    else navigate('/reclamations', { replace: true });
  }

  if (loading) return <Spinner label="Chargement du ticket..." />;

  if (!ticket) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
        <Link to="/dashboard" className="btn-outline mt-4 w-full">
          Retour au tableau de bord
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 page-title">Ticket</h1>
          <p className="font-mono text-xs text-slate-500">#{ticket.id.slice(0, 8)}</p>
        </div>
        <Link to="/dashboard" className="text-sm font-semibold text-teal-700">
          Tableau de bord
        </Link>
      </header>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-slate-900">
              {ticket.automates?.nom ?? 'Automate supprimé'}
            </h2>
            <span className={`badge ${PRIORITE_STYLES[ticket.priorite]}`}>{ticket.priorite}</span>
          </div>
          <span className={`badge mt-2 ${STATUT_STYLES[ticket.statut]}`}>{ticket.statut}</span>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Modèle</dt>
              <dd className="font-medium text-slate-900">{ticket.automates?.modele ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">N° de série</dt>
              <dd className="font-mono font-medium text-slate-900">
                {ticket.numero_serie ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Créé le</dt>
              <dd className="font-medium text-slate-900">
                {new Date(ticket.created_at).toLocaleString('fr-FR')}
              </dd>
            </div>
          </dl>
        </div>

        {ticket.message_erreur && (
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-900">Message d'erreur</h3>
            <p className="mt-1 font-mono text-sm text-slate-700">{ticket.message_erreur}</p>
          </div>
        )}

        {ticket.code_erreur && (
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-900">Code erreur</h3>
            <p className="mt-1 font-mono text-sm text-slate-700">{ticket.code_erreur}</p>
          </div>
        )}

        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900">Description</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {ticket.description ?? '—'}
          </p>
        </div>

        {photoUrl ? (
          <div className="card">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Photo</h3>
            <img
              src={photoUrl}
              alt="Photo du ticket"
              onError={() => {
                setPhotoUrl(null);
                setPhotoError('La photo est introuvable sur le serveur.');
              }}
              className="w-full rounded-lg object-cover"
            />
          </div>
        ) : photoError ? (
          <div className="card">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Photo</h3>
            <p className="text-xs text-amber-700">Photo indisponible : {photoError}</p>
          </div>
        ) : null}

        <div className="card">
          <label htmlFor="statut" className="label">
            Mettre à jour le statut
          </label>
          <div className="flex gap-2">
            <select
              id="statut"
              value={statut}
              onChange={(e) => {
                setStatut(e.target.value as Statut);
                setSaved(false);
              }}
              className="input"
            >
              <option value="ouvert">Ouvert</option>
              <option value="en_cours">En cours</option>
              <option value="resolu">Résolu</option>
            </select>
            <button
              type="button"
              onClick={handleSaveStatut}
              disabled={saving || statut === ticket.statut}
              className="btn-primary shrink-0"
            >
              {saving ? '...' : 'Enregistrer'}
            </button>
          </div>
          {saved && <p className="mt-2 text-xs font-medium text-green-700">Statut enregistré.</p>}
          {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
        </div>
        </div>

        <div className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Journal des interventions ({interventions.length})
          </h3>
          {interventions.length === 0 ? (
            <p className="mb-2 text-xs text-slate-500">
              Aucune intervention pour l'instant — soyez le premier à commenter.
            </p>
          ) : (
            <ul className="mb-3 max-h-72 space-y-2 overflow-y-auto">
              {interventions.map((i) => (
                <li key={i.id} className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {i.profiles?.full_name ?? 'Utilisateur BioPlus'}
                      {i.user_id === user?.id ? ' (vous)' : ''}
                    </span>
                    <span className="shrink-0 text-slate-400">
                      {new Date(i.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{i.message}</p>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handlePostIntervention} className="flex gap-2">
            <input
              value={interventionText}
              onChange={(e) => setInterventionText(e.target.value)}
              placeholder="Ajouter une intervention (diagnostic, pièce remplacée...)"
              maxLength={2000}
              className="input flex-1 text-sm"
            />
            <button type="submit" disabled={posting || !interventionText.trim()} className="btn-primary shrink-0">
              {posting ? '...' : 'Ajouter'}
            </button>
          </form>
        </div>

        {profile?.role === 'admin' && (
          <button
            type="button"
            onClick={removeTicket}
            className="btn-danger w-full"
          >
            Supprimer cette réclamation
          </button>
        )}
        <Link to="/dashboard" className="btn-outline w-full">
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}