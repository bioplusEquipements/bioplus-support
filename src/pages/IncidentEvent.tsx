import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, type Intervention, type Statut, type TicketWithAutomate } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { C, relTime } from '../lib/galacticos';

const STATUT_COLORS: Record<Statut, string> = {
  ouvert: C.cyan,
  en_cours: C.warning,
  resolu: C.emerald
};

const STATUT_LABELS: Record<Statut, string> = {
  ouvert: 'OUVERT',
  en_cours: 'EN COURS',
  resolu: 'RÉSOLU'
};

export default function IncidentEvent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

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
      .select('*, automates(id, nom, modele), laboratoire:laboratoires(nom)')
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

  const timeline = useMemo(() => {
    if (!ticket) return [];
    const events: { label: string; time: string; color: string }[] = [];
    events.push({ label: 'SIGNAL DÉTECTÉ / TICKET CRÉÉ', time: ticket.created_at, color: C.cyan });
    if (ticket.technicien_id) {
      events.push({
        label: 'TECHNICIEN ASSIGNÉ',
        time: ticket.updated_at ?? ticket.created_at,
        color: C.violet
      });
    }
    for (const iv of interventions) {
      events.push({ label: `INTERVENTION — ${iv.message}`, time: iv.created_at, color: C.violet });
    }
    if (ticket.statut === 'resolu') {
      events.push({ label: 'RÉSOLUTION', time: ticket.updated_at ?? ticket.created_at, color: C.emerald });
    }
    return events;
  }, [ticket, interventions]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#05080F] text-slate-300">
        <div className="h-2 w-2 animate-pulse rounded-full bg-[#00E5FF] shadow-[0_0_12px_#00E5FF]" />
        <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-cyan-400/60">
          Chargement de l'événement…
        </p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#05080F] p-6">
        <p className="rounded-xl border border-[#FF0054]/30 bg-[#FF0054]/10 px-4 py-3 text-sm text-slate-200">
          {error}
        </p>
        <Link to="/dashboard" className="mt-4 rounded-lg border border-cyan-400/30 px-4 py-2 text-xs font-semibold text-cyan-300">
          ← RETOUR AU CENTRE DE CONTRÔLE
        </Link>
      </div>
    );
  }

  const year = new Date(ticket.created_at).getFullYear();

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-300 antialiased">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,229,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.6) 1px, transparent 1px)',
          backgroundSize: '44px 44px'
        }}
      />

      <header className="sticky top-0 z-10 border-b border-cyan-400/10 bg-[#05080F]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Link to="/dashboard" className="text-[11px] font-semibold tracking-widest text-cyan-400/80 transition hover:text-cyan-300">
            ← CENTRE DE CONTRÔLE
          </Link>
          <p className="hidden text-[10px] uppercase tracking-[0.3em] text-slate-500 sm:block">
            Incident Event
          </p>
          <div className="flex items-center gap-2">
            {user && (
              <span className="hidden text-[10px] text-slate-600 md:inline">{user.email}</span>
            )}
            <button
              onClick={async () => {
                await signOut();
                navigate('/login', { replace: true });
              }}
              className="rounded-lg bg-[#FF0054]/10 px-3 py-1.5 text-[11px] font-semibold text-[#FF0054] transition hover:bg-[#FF0054]/20"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl space-y-4 px-4 py-5 lg:px-6">
        {/* EN-TÊTE INCIDENT */}
        <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-5 shadow-lg shadow-black/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: STATUT_COLORS[ticket.statut], boxShadow: `0 0 8px ${STATUT_COLORS[ticket.statut]}` }}
                />
                Incident #{year}-{ticket.id.slice(0, 8).toUpperCase()}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-100">
                {ticket.message_erreur ?? ticket.code_erreur ?? 'Réclamation'}
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                {ticket.description ?? 'Aucune description complémentaire'}
              </p>
            </div>
            <span
              className="rounded border px-2 py-1 text-[10px] font-bold tracking-widest"
              style={{
                color: STATUT_COLORS[ticket.statut],
                borderColor: `${STATUT_COLORS[ticket.statut]}55`,
                backgroundColor: `${STATUT_COLORS[ticket.statut]}11`
              }}
            >
              {STATUT_LABELS[ticket.statut]}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { k: 'AUTOMATE', v: ticket.automates?.nom ?? 'Automate supprimé' },
              { k: 'LABORATOIRE', v: ticket.laboratoire?.nom ?? 'Inconnu' },
              { k: 'ÉVÉNEMENT', v: ticket.code_erreur ?? ticket.message_erreur ?? '—' },
              { k: 'TEMPS', v: `${new Date(ticket.created_at).toLocaleDateString('fr-FR')} · ${new Date(ticket.created_at).toLocaleTimeString('fr-FR')}` }
            ].map((d) => (
              <div key={d.k} className="rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                <dt className="text-[9px] uppercase tracking-widest text-slate-500">{d.k}</dt>
                <dd className="mt-0.5 truncate text-xs font-semibold text-slate-200">{d.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {photoUrl ? (
          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF]" />
              Preuve visuelle
            </h2>
            <img
              src={photoUrl}
              alt="Photo du ticket"
              onError={() => {
                setPhotoUrl(null);
                setPhotoError('La photo est introuvable sur le serveur.');
              }}
              className="max-h-72 w-full rounded-lg object-cover"
            />
          </section>
        ) : photoError ? (
          <section className="rounded-xl border border-[#FFB703]/25 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#FFB703]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FFB703]" />
              Preuve visuelle
            </h2>
            <p className="text-xs text-slate-400">Photo indisponible : {photoError}</p>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* TIMELINE */}
          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF]" />
              Traçabilité
            </h2>
            <ul className="max-h-72 space-y-0 overflow-y-auto pr-1">
              {timeline.map((ev, idx) => (
                <li key={idx} className="relative flex gap-3 pb-4 last:pb-0">
                  {idx < timeline.length - 1 && (
                    <span className="absolute left-[3px] top-2.5 h-full w-px bg-slate-700/60" />
                  )}
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ev.color, boxShadow: `0 0 8px ${ev.color}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-200">{ev.label}</p>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600">{relTime(ev.time)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* INTERVENTIONS */}
          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF]" />
              Journal des interventions ({interventions.length})
            </h2>
            {interventions.length === 0 ? (
              <p className="mb-2 text-xs text-slate-500">
                Aucune intervention pour l'instant — soyez le premier à commenter.
              </p>
            ) : (
              <ul className="mb-3 max-h-52 space-y-2 overflow-y-auto">
                {interventions.map((i) => (
                  <li key={i.id} className="rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200">
                        {i.profiles?.full_name ?? 'Utilisateur BioPlus'}
                        {i.user_id === user?.id ? ' (vous)' : ''}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-500">
                        {new Date(i.created_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-slate-400">{i.message}</p>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handlePostIntervention} className="flex gap-2">
              <input
                value={interventionText}
                onChange={(e) => setInterventionText(e.target.value)}
                placeholder="Diagnostic, pièce remplacée…"
                maxLength={2000}
                className="flex-1 rounded-lg border border-slate-700 bg-[#05080F] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-cyan-400/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={posting || !interventionText.trim()}
                className="shrink-0 rounded-lg bg-[#00E5FF]/15 px-3 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-[#00E5FF]/25 disabled:opacity-40"
              >
                {posting ? '…' : 'Ajouter'}
              </button>
            </form>
            {error && <p className="mt-2 text-[11px] text-[#FFB703]">{error}</p>}
          </section>
        </div>

        {/* CONTRÔLE */}
        <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="statut" className="text-[10px] uppercase tracking-widest text-slate-500">
                Statut
              </label>
              <select
                id="statut"
                value={statut}
                onChange={(e) => {
                  setStatut(e.target.value as Statut);
                  setSaved(false);
                }}
                className="rounded-lg border border-slate-700 bg-[#05080F] px-3 py-2 text-xs font-semibold text-slate-200 focus:border-cyan-400/50 focus:outline-none"
              >
                <option value="ouvert">Ouvert</option>
                <option value="en_cours">En cours</option>
                <option value="resolu">Résolu</option>
              </select>
              <button
                type="button"
                onClick={handleSaveStatut}
                disabled={saving || statut === ticket.statut}
                className="rounded-lg bg-gradient-to-r from-[#00E5FF]/20 to-[#00FFA3]/20 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:from-[#00E5FF]/30 hover:to-[#00FFA3]/30 disabled:opacity-40"
              >
                {saving ? '…' : 'Enregistrer'}
              </button>
              {saved && <span className="text-[11px] text-[#00FFA3]">Statut enregistré.</span>}
            </div>
            {profile?.role === 'admin' && (
              <button
                type="button"
                onClick={removeTicket}
                className="rounded-lg bg-[#FF0054]/10 px-3 py-2 text-xs font-semibold text-[#FF0054] transition hover:bg-[#FF0054]/20"
              >
                Supprimer cette réclamation
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}