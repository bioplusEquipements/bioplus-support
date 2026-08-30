import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase, type Automate } from '../lib/supabaseClient';
import { C, LEVEL_META, healthFor, levelOf, relTime, type HealthLevel } from '../lib/galacticos';

interface AutoTicket {
  id: string;
  priorite: 'normal' | 'important' | 'critique';
  statut: 'ouvert' | 'en_cours' | 'resolu';
  created_at: string;
  updated_at: string | null;
  message_erreur: string | null;
  code_erreur: string | null;
  description: string | null;
}

interface AutoIntervention {
  id: string;
  ticket_id: string;
  message: string;
  created_at: string;
}

export default function AutomateProfile() {
  const { id } = useParams<{ id: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [automate, setAutomate] = useState<Automate | null>(null);
  const [labo, setLabo] = useState<string | null>(null);
  const [tickets, setTickets] = useState<AutoTicket[]>([]);
  const [interventions, setInterventions] = useState<AutoIntervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Identifiant d’automate manquant dans l’URL.');
      setLoading(false);
      return;
    }
    Promise.all([
      supabase
        .from('automates')
        .select('*, laboratoire:laboratoires(nom)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('tickets')
        .select('id, priorite, statut, created_at, updated_at, message_erreur, code_erreur, description')
        .eq('automate_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
    ]).then(async ([a, t]) => {
      if (a.error || !a.data) {
        setError('Automate introuvable ou accès refusé (RLS).');
      } else {
        setAutomate(a.data as Automate);
        setLabo((a.data as { laboratoire: { nom: string } | null }).laboratoire?.nom ?? null);
      }
      const ticketList = (t.data as AutoTicket[] | null) ?? [];
      setTickets(ticketList);
      if (ticketList.length > 0) {
        const ticketIds = ticketList.map((tk) => tk.id);
        const { data: ivData } = await supabase
          .from('interventions')
          .select('id, ticket_id, message, created_at')
          .in('ticket_id', ticketIds)
          .order('created_at', { ascending: false })
          .limit(50);
        setInterventions((ivData as AutoIntervention[] | null) ?? []);
      }
      setLoading(false);
    });
  }, [id]);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.statut !== 'resolu').length;
    const lastIntervention = interventions[0]?.created_at ?? null;
    const health = healthFor(open, lastIntervention);

    const timeline: { time: string; kind: 'ticket' | 'intervention'; color: string; label: string }[] =
      [];
    for (const t of tickets) {
      timeline.push({
        time: t.created_at,
        kind: 'ticket',
        color: t.statut === 'resolu' ? C.emerald : t.statut === 'en_cours' ? C.warning : C.cyan,
        label: `Ticket ${t.statut}${t.message_erreur ? ` — ${t.message_erreur}` : ''}`
      });
    }
    for (const iv of interventions) {
      timeline.push({
        time: iv.created_at,
        kind: 'intervention',
        color: C.violet,
        label: `Intervention — ${iv.message}`
      });
    }
    timeline.sort((a, b) => (a.time < b.time ? 1 : -1));

    const patterns: { code: string; count: number; last: string }[] = [];
    const cutoff = Date.now() - 30 * 86_400_000;
    const recent = tickets.filter((t) => new Date(t.created_at).getTime() >= cutoff);
    const byKey = new Map<string, { count: number; last: string }>();
    for (const t of recent) {
      const key = (t.code_erreur ?? t.message_erreur ?? 'générique').trim();
      const entry = byKey.get(key) ?? { count: 0, last: t.created_at };
      entry.count += 1;
      if (t.created_at > entry.last) entry.last = t.created_at;
      byKey.set(key, entry);
    }
    for (const [code, entry] of byKey) {
      if (entry.count >= 2) patterns.push({ code, count: entry.count, last: entry.last });
    }
    patterns.sort((a, b) => b.count - a.count);

    return { open, health, timeline, patterns };
  }, [tickets, interventions]);

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#05080F] text-slate-300">
        <div className="h-2 w-2 animate-pulse rounded-full bg-[#00E5FF] shadow-[0_0_12px_#00E5FF]" />
        <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-cyan-400/60">
          Analyse de l'automate…
        </p>
      </div>
    );
  }

  if (!automate) {
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

  const level: HealthLevel = levelOf(stats.health);
  const ring = 2 * Math.PI * 54;
  const pct = stats.health ?? 0;

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
            Automate Profile
          </p>
          <div className="flex items-center gap-2">
            {user && (
              <span className="hidden text-[10px] text-slate-600 md:inline">{user.email}</span>
            )}
            <button
              onClick={handleLogout}
              className="rounded-lg bg-[#FF0054]/10 px-3 py-1.5 text-[11px] font-semibold text-[#FF0054] transition hover:bg-[#FF0054]/20"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl space-y-4 px-4 py-5 lg:px-6">
        {/* EN-TÊTE AUTOMATE */}
        <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-5 shadow-lg shadow-black/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
                Unité du parc · {labo ?? 'Laboratoire inconnu'}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-100">{automate.nom}</h1>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {automate.modele ?? 'Modèle inconnu'} · {automate.numero_serie ?? 'N° série inconnu'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className="rounded border px-2 py-1 text-[10px] font-bold tracking-widest"
                style={{
                  color: LEVEL_META[level].color,
                  borderColor: `${LEVEL_META[level].color}55`,
                  backgroundColor: `${LEVEL_META[level].color}11`
                }}
              >
                {LEVEL_META[level].dot} {LEVEL_META[level].label}
              </span>
              <Link
                to={`/ticket/new?automate_id=${automate.id}`}
                className="rounded-lg bg-gradient-to-r from-[#00E5FF]/20 to-[#00FFA3]/20 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:from-[#00E5FF]/30 hover:to-[#00FFA3]/30"
              >
                + Créer une réclamation
              </Link>
            </div>
          </div>
        </section>

        {/* PATTERN DETECTED */}
        {stats.patterns.length > 0 && (
          <section className="rounded-xl border border-[#FFB703]/25 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#FFB703]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FFB703]" />
              Pattern detected · 30 derniers jours
            </h2>
            <ul className="mt-2 space-y-1">
              {stats.patterns.slice(0, 3).map((p) => (
                <li key={p.code} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-slate-200">
                    {p.count} incident(s) similaires — « {p.code} »
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                    {relTime(p.last)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* SANTÉ + MÉTRIQUES */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-5 shadow-lg shadow-black/40">
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              Analyzer Health
            </h2>
            <div className="relative mx-auto h-40 w-40">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#0B1220" strokeWidth="8" />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke={LEVEL_META[level].color}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * ring} ${ring}`}
                  style={{ filter: `drop-shadow(0 0 6px ${LEVEL_META[level].color})` }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-extralight tabular-nums" style={{ color: LEVEL_META[level].color }}>
                  {stats.health ?? '—'}
                </p>
                <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
                  {stats.health === null ? 'No data' : '/ 100'}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-slate-100">{stats.open}</p>
                <p className="text-[8px] uppercase tracking-widest text-slate-500">Tickets ouverts</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-100">
                  {tickets.filter((t) => t.statut === 'resolu').length}
                </p>
                <p className="text-[8px] uppercase tracking-widest text-slate-500">Résolus</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-100">{tickets.length}</p>
                <p className="text-[8px] uppercase tracking-widest text-slate-500">Tickets</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-5 shadow-lg shadow-black/40">
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              Telemetry
            </h2>
            <ul className="space-y-2">
              <li className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Statut</span>
                <span className="text-xs font-semibold text-slate-200">{automate.statut ?? 'inconnu'}</span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Dernière intervention</span>
                <span className="text-xs font-semibold" style={{ color: LEVEL_META[level].color }}>
                  {stats.health !== null && stats.timeline[0]
                    ? relTime(stats.timeline[0].time)
                    : 'aucune'}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Dernière activité</span>
                <span className="text-xs font-semibold text-slate-200">
                  {tickets[0] ? relTime(tickets[0].created_at) : 'aucune'}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Maintenance</span>
                <span className="text-xs font-semibold text-slate-200">
                  {stats.health !== null && stats.timeline[0]
                    ? relTime(stats.timeline[0].time)
                    : '—'}
                </span>
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-5 shadow-lg shadow-black/40">
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              Technical Timeline
            </h2>
            {stats.timeline.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Aucun événement enregistré pour cette unité.
              </p>
            ) : (
              <ul className="max-h-64 space-y-0 overflow-y-auto pr-1">
                {stats.timeline.map((ev, idx) => (
                  <li key={idx} className="relative flex gap-3 pb-4 last:pb-0">
                    {idx < stats.timeline.length - 1 && (
                      <span className="absolute left-[3px] top-2.5 h-full w-px bg-slate-700/60" />
                    )}
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: ev.color, boxShadow: `0 0 8px ${ev.color}` }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-200">{ev.label}</p>
                      <p className="text-[9px] uppercase tracking-widest text-slate-600">
                        {ev.kind} · {relTime(ev.time)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}