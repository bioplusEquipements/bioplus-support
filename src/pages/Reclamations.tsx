import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { edge } from '../lib/edge';
import { supabase, type Priorite, type Statut, type TicketWithAutomate } from '../lib/supabaseClient';
import Spinner from '../components/Spinner';

const STATUT_LABELS: Record<Statut, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  resolu: 'Résolu'
};

const STATUT_STYLES: Record<Statut, string> = {
  ouvert: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-amber-100 text-amber-800',
  resolu: 'bg-green-100 text-green-800'
};

const PRIORITE_STYLES: Record<Priorite, string> = {
  normal: 'bg-slate-100 text-slate-700',
  important: 'bg-amber-100 text-amber-800',
  critique: 'bg-red-100 text-red-700'
};

interface Technicien {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  banned: boolean;
}

export default function Reclamations() {
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [techniciens, setTechniciens] = useState<Technicien[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refreshing = useRef(false);

  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    setError(null);
    try {
      const [tickRes, usersRes] = await Promise.all([
        supabase
          .from('tickets')
          .select(
            '*, automates(id, nom, modele), laboratoire:laboratoires(id, nom), technicien:profiles!tickets_technicien_id_fkey(full_name)'
          )
          .order('created_at', { ascending: false })
          .limit(200),
        edge<{ users: Technicien[] }>('list-users')
      ]);
      if (tickRes.error) setError(tickRes.error.message);
      else setTickets(tickRes.data as TicketWithAutomate[]);
      if (usersRes.error) setError(usersRes.error.message);
      else
        setTechniciens(
          (usersRes.data?.users ?? []).filter((u) => u.role === 'technicien' && !u.banned)
        );
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    const channel = supabase
      .channel('reclamations-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => refresh()
      )
      .subscribe();
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  async function assign(t: TicketWithAutomate, technicienId: string) {
    setBusyId(t.id);
    setError(null);
    const { error: err } = await supabase
      .from('tickets')
      .update({ technicien_id: technicienId || null })
      .eq('id', t.id);
    setBusyId(null);
    if (err) setError(err.message);
    else {
      if (technicienId) {
        edge('notify', { type: 'assignation', ticket_id: t.id, technicien_id: technicienId });
      }
      refresh();
    }
  }

  async function removeTicket(t: TicketWithAutomate) {
    if (!window.confirm(`Supprimer définitivement cette réclamation (${t.automates?.nom ?? 'machine inconnue'}) ?`)) return;
    if (!window.confirm('Confirmer la suppression IRREVERSIBLE ?')) return;
    setBusyId(t.id);
    setError(null);
    const { error: err } = await supabase.from('tickets').delete().eq('id', t.id);
    setBusyId(null);
    if (err) setError(err.message);
    else refresh();
  }

  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('');
  const [prioriteFilter, setPrioriteFilter] = useState('');
  const [laboFilter, setLaboFilter] = useState('');

  const filtered = tickets.filter((t) => {
    if (search) {
      const hay = `${t.message_erreur ?? ''} ${t.description ?? ''} ${t.automates?.nom ?? ''} ${t.laboratoire?.nom ?? ''} ${t.code_erreur ?? ''}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    if (statutFilter && t.statut !== statutFilter) return false;
    if (prioriteFilter && t.priorite !== prioriteFilter) return false;
    if (laboFilter && t.laboratoire_id !== laboFilter) return false;
    return true;
  });

  const labos = [...new Map(tickets.map((t) => [t.laboratoire_id, t.laboratoire?.nom])).entries()]
    .filter(([, nom]) => nom)
    .map(([id, nom]) => ({ id: id as string, nom: nom as string }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  if (loading && tickets.length === 0) return <Spinner label="Chargement des réclamations..." />;

  const aDispatcher = filtered.filter((t) => !t.technicien_id && t.statut !== 'resolu');
  const suivies = filtered.filter((t) => t.technicien_id || t.statut === 'resolu');

  function renderTicket(t: TicketWithAutomate, showLabo: boolean) {
    return (
      <li key={t.id}>
        <Link to={`/ticket/${t.id}`} className="card block transition hover:border-teal-600">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {t.automates?.nom ?? 'Automate supprimé'}
                {showLabo && t.laboratoire?.nom ? ` · ${t.laboratoire.nom}` : ''}
              </p>
              <p className="truncate text-xs text-slate-500">
                {t.message_erreur ?? t.description ?? 'Sans message'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`badge ${PRIORITE_STYLES[t.priorite]}`}>{t.priorite}</span>
              <span className={`badge ${STATUT_STYLES[t.statut]}`}>{STATUT_LABELS[t.statut]}</span>
            </div>
          </div>
        </Link>
        <div className="mt-3 flex gap-2 px-4 pb-4">
          <select
            value={t.technicien_id ?? ''}
            disabled={busyId === t.id}
            onChange={(e) => assign(t, e.target.value)}
            className="input flex-1 text-sm"
          >
            <option value="">- à dispatcher -</option>
            {techniciens.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name ?? tech.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => removeTicket(t)}
            disabled={busyId === t.id}
            className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            Supprimer
          </button>
        </div>
          {t.technicien && (
            <p className="px-4 pb-3 text-xs text-slate-500">
              Assigné à : <strong>{t.technicien.full_name ?? 'Technicien BioPlus'}</strong>
            </p>
          )}
      </li>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 page-title">Réclamations</h1>
          <p className="text-xs text-slate-500">
            {tickets.length} réclamation(s) · {aDispatcher.length} à dispatcher
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={loading} className="btn-outline px-3 py-1.5 text-xs">
            Actualiser
          </button>
          <Link to="/dashboard" className="btn-outline px-3 py-1.5 text-xs">
            Tableau de bord
          </Link>
        </div>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card mb-4 space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (machine, erreur, laboratoire, code...)"
          className="input w-full text-sm"
        />
        <div className="grid grid-cols-3 gap-2">
          <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="input text-sm">
            <option value="">Statut</option>
            <option value="ouvert">Ouvert</option>
            <option value="en_cours">En cours</option>
            <option value="resolu">Résolu</option>
          </select>
          <select value={prioriteFilter} onChange={(e) => setPrioriteFilter(e.target.value)} className="input text-sm">
            <option value="">Priorité</option>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="critique">Critique</option>
          </select>
          <select value={laboFilter} onChange={(e) => setLaboFilter(e.target.value)} className="input text-sm">
            <option value="">Laboratoire</option>
            {labos.map((l) => (
              <option key={l.id} value={l.id}>{l.nom}</option>
            ))}
          </select>
        </div>
        {(search || statutFilter || prioriteFilter || laboFilter) && (
          <button
            onClick={() => {
              setSearch('');
              setStatutFilter('');
              setPrioriteFilter('');
              setLaboFilter('');
            }}
            className="text-xs font-semibold text-teal-700"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {aDispatcher.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-red-700">
            À dispatcher ({aDispatcher.length})
          </h2>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{aDispatcher.map((t) => renderTicket(t, true))}</ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-900">
          Assignées / terminées ({suivies.length})
        </h2>
        {suivies.length === 0 ? (
          <div className="card bg-slate-100 text-center">
            <p className="text-sm text-slate-500">Aucune réclamation suivie pour le moment.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{suivies.map((t) => renderTicket(t, true))}</ul>
        )}
      </section>
    </div>
  );
}