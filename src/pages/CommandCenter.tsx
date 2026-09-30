import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import {
  C,
  LEVEL_META,
  healthFor,
  levelOf,
  relTime,
  type HealthLevel
} from '../lib/galacticos';

// ─────────────────────────────────────────────────────────────────────────────
// Composant
// ─────────────────────────────────────────────────────────────────────────────

interface FleetAutomate {
  id: string;
  nom: string;
  modele: string | null;
  laboratoire_id: string;
  statut: string | null;
}

interface FleetTicket {
  id: string;
  automate_id: string;
  priorite: 'normal' | 'important' | 'critique';
  statut: 'ouvert' | 'en_cours' | 'resolu';
  created_at: string;
  message_erreur: string | null;
  description: string | null;
  automates: Pick<FleetAutomate, 'id' | 'nom' | 'laboratoire_id'> | null;
  laboratoire: { nom: string } | null;
}

interface FleetIntervention {
  ticket_id: string;
  message: string;
  created_at: string;
}

export default function CommandCenter() {
  const { profile, user } = useAuth();

  const [automates, setAutomates] = useState<FleetAutomate[]>([]);
  const [tickets, setTickets] = useState<FleetTicket[]>([]);
  const [interventions, setInterventions] = useState<FleetIntervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(0);
  const [switchError] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('command-center-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () =>
        setLive((n) => n + 1)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from('automates')
        .select('id, nom, modele, laboratoire_id, statut')
        .order('nom', { ascending: true })
        .limit(500),
      supabase
        .from('tickets')
        .select(
          'id, automate_id, priorite, statut, created_at, message_erreur, description, automates(id, nom, laboratoire_id), laboratoire:laboratoires(nom)'
        )
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('interventions')
        .select('ticket_id, message, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
    ]).then(([a, t, i]) => {
      setAutomates((a.data as FleetAutomate[] | null) ?? []);
      setTickets((t.data as FleetTicket[] | null) ?? []);
      setInterventions((i.data as FleetIntervention[] | null) ?? []);
      setLoading(false);
    });
  }, [live]);

  const stats = useMemo(() => {
    const byAutomate: Record<string, { open: number; lastIntervention: string | null }> = {};
    for (const t of tickets) {
      if (t.statut === 'resolu') continue;
      const entry = (byAutomate[t.automate_id] ??= { open: 0, lastIntervention: null });
      entry.open += 1;
    }
    const ticketToAutomate = new Map(tickets.map((t) => [t.id, t.automate_id]));
    for (const iv of interventions) {
      const automateId = ticketToAutomate.get(iv.ticket_id);
      if (!automateId) continue;
      const entry = (byAutomate[automateId] ??= { open: 0, lastIntervention: null });
      if (!entry.lastIntervention || iv.created_at > entry.lastIntervention) {
        entry.lastIntervention = iv.created_at;
      }
    }

    const fleet = automates.map((a) => {
      const data = byAutomate[a.id];
      const health = healthFor(data?.open ?? 0, data?.lastIntervention ?? null);
      return { automate: a, health, open: data?.open ?? 0 };
    });

    const counts: Record<HealthLevel, number> = { online: 0, warning: 0, critical: 0, nodata: 0 };
    for (const f of fleet) counts[levelOf(f.health)] += 1;

    const scored = fleet.filter((f) => f.health !== null);
    const fleetHealth = scored.length
      ? Math.round(scored.reduce((sum, f) => sum + (f.health ?? 0), 0) / scored.length)
      : null;

    const top5 = [...scored].sort((x, y) => (x.health ?? 0) - (y.health ?? 0)).slice(0, 5);

    const criticalSignals = tickets
      .filter((t) => t.statut !== 'resolu' && t.priorite === 'critique')
      .slice(0, 6);

    const days: { date: Date; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ date: d, label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), count: 0 });
    }
    for (const t of tickets) {
      const created = new Date(t.created_at);
      for (const day of days) {
        if (
          created.getFullYear() === day.date.getFullYear() &&
          created.getMonth() === day.date.getMonth() &&
          created.getDate() === day.date.getDate()
        ) {
          day.count += 1;
          break;
        }
      }
    }
    const maxDay = Math.max(1, ...days.map((d) => d.count));

    const operations: { time: string; kind: 'ticket' | 'intervention'; color: string; label: string }[] =
      [];
    for (const t of tickets.slice(0, 20)) {
      const color = t.statut === 'resolu' ? C.emerald : t.statut === 'en_cours' ? C.warning : C.cyan;
      operations.push({
        time: t.created_at,
        kind: 'ticket',
        color,
        label: `Ticket ${t.statut} — ${t.automates?.nom ?? 'Automate supprimé'}${t.laboratoire ? ` · ${t.laboratoire.nom}` : ''}`
      });
    }
    for (const iv of interventions.slice(0, 20)) {
      operations.push({
        time: iv.created_at,
        kind: 'intervention',
        color: C.violet,
        label: `Intervention — ${iv.message}`
      });
    }
    operations.sort((a, b) => (a.time < b.time ? 1 : -1));
    const recentOperations = operations.slice(0, 10);

    return { fleet, counts, fleetHealth, top5, criticalSignals, days, maxDay, recentOperations };
  }, [automates, tickets, interventions]);

  const scopeLabel =
    profile?.role === 'admin'
      ? 'COMMAND CENTER · FLOTTE COMPLÈTE'
      : profile?.role === 'technicien'
        ? 'MISSIONS ASSIGNÉES'
        : profile?.laboratoire_nom
          ? `LABORATOIRE ${profile.laboratoire_nom.toUpperCase()}`
          : 'LABORATOIRE — NON RATTACHÉ';

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-slate-300">
        <div className="h-2 w-2 animate-pulse rounded-full bg-[#00E5FF] shadow-[0_0_12px_#00E5FF]" />
        <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-cyan-400/60">
          Connexion au centre de contrôle…
        </p>
      </div>
    );
  }

  const { counts, fleetHealth, top5, criticalSignals, days, maxDay, recentOperations } = stats;

  return (
    <div className="relative flex flex-col text-slate-300 antialiased">
      {/* fond : grille technique subtile */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,229,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.6) 1px, transparent 1px)',
          backgroundSize: '44px 44px'
        }}
      />

      {/* Identite, statut reseau et deconnexion sont desormais dans le Layout. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-[#00FFA3]/40" />
            <span className="h-2 w-2 rounded-full bg-[#00FFA3] shadow-[0_0_10px_#00FFA3]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-widest text-slate-100">
              BIOPLUS <span className="text-[#00E5FF]">GALACTICOS</span>
            </p>
            <p className="truncate text-[9px] uppercase tracking-[0.3em] text-slate-500">
              Technical Operations Center
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="hidden rounded border border-emerald-400/30 bg-emerald-400/5 px-2 py-1 text-[9px] font-semibold tracking-widest text-[#00FFA3] sm:inline">
            ● NETWORK ONLINE
          </span>
          <span className="hidden rounded border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-[9px] tracking-widest text-cyan-300/80 md:inline">
            {scopeLabel}
          </span>
          <Link
            to="/galaxy"
            className="rounded-lg border border-cyan-400/30 px-3 py-1.5 text-[11px] font-semibold text-cyan-300 transition hover:bg-cyan-400/10"
          >
            ✦ GALAXY
          </Link>
        </div>
      </div>

      {switchError && (
        <p className="mb-4 rounded-lg border border-[#FF0054]/30 bg-[#FF0054]/10 px-3 py-2 text-xs text-[#FFB703]">
            {switchError}
          </p>
        )}

        {/* FLEET STATUS */}
        <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-5 shadow-lg shadow-black/40">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
                Fleet Status
              </p>
              <p className="mt-1 text-6xl font-extralight leading-none text-slate-100">
                {automates.length}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                Analyzers under monitoring
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['online', 'warning', 'critical', 'nodata'] as HealthLevel[]).map((lvl) => (
                <div
                  key={lvl}
                  className="rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2"
                >
                  <p className="text-2xl font-bold" style={{ color: LEVEL_META[lvl].color }}>
                    {counts[lvl]}
                  </p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                    <span className="mr-1" style={{ color: LEVEL_META[lvl].color }}>
                      {LEVEL_META[lvl].dot}
                    </span>
                    {LEVEL_META[lvl].label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-700/40 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
                Fleet Health
              </p>
              <p className="text-sm font-bold text-slate-100">
                {fleetHealth !== null ? (
                  <>
                    <span className="text-[#00E5FF]">{fleetHealth}%</span>
                    <span className="ml-1 text-[10px] font-normal uppercase tracking-widest text-slate-500">
                      moyenne du parc
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] font-normal uppercase tracking-widest text-slate-500">
                    Pas encore de données suffisantes
                  </span>
                )}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#05080F]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#00FFA3] transition-all duration-700"
                style={{ width: `${fleetHealth ?? 0}%` }}
              />
            </div>
          </div>
        </section>

        {/* RANGÉE 2 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF]" />
              Network Activity · 7 derniers jours
            </h2>
            <div className="flex h-28 items-end gap-1.5">
              {days.map((d, idx) => (
                <div key={idx} className="group flex flex-1 flex-col items-center gap-1">
                  <div
                    title={`${d.count} ticket(s) — ${d.label}`}
                    className="w-full rounded-t-sm bg-[#00E5FF]/15 transition group-hover:bg-[#00E5FF]/40"
                    style={{
                      height: d.count > 0 ? `${Math.max(8, (d.count / maxDay) * 100)}%` : '4px',
                      backgroundColor: d.count > 0 ? '#00E5FF' : 'rgba(51,65,85,0.6)'
                    }}
                  />
                  <span className="text-[8px] tabular-nums text-slate-600">{d.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF]" />
              Critical Signals
            </h2>
            {criticalSignals.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-xs text-[#00FFA3]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00FFA3]" />
                Aucun signal critique — parc stable.
              </p>
            ) : (
              <ul className="divide-y divide-slate-700/40">
                {criticalSignals.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/automate/${t.automate_id}`}
                      className="flex items-center gap-3 py-2 transition hover:bg-cyan-400/5"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF0054] shadow-[0_0_8px_#FF0054]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-100">
                          {t.automates?.nom ?? 'Automate supprimé'}
                        </p>
                        <p className="truncate text-[10px] text-slate-500">
                          {t.laboratoire?.nom ?? 'Labo inconnu'} ·{' '}
                          {t.message_erreur ?? t.description ?? 'Sans message'}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                        {relTime(t.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* RANGÉE 3 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF]" />
              Recent Operations
            </h2>
            {recentOperations.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Aucune opération récente.
              </p>
            ) : (
              <ul className="space-y-1">
                {recentOperations.map((op, idx) => (
                  <li key={idx} className="flex items-start gap-3 py-1.5">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: op.color, boxShadow: `0 0 8px ${op.color}` }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-200">{op.label}</p>
                      <p className="text-[9px] uppercase tracking-widest text-slate-600">
                        {op.kind}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                      {relTime(op.time)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF]" />
              Top 5 · Machines à surveiller
            </h2>
            {top5.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Données insuffisantes pour établir un classement.
              </p>
            ) : (
              <ul className="space-y-2">
                {top5.map((f, idx) => (
                  <li key={f.automate.id}>
                    <Link
                      to={`/automate/${f.automate.id}`}
                      className="flex items-center gap-3 rounded-lg p-1 transition hover:bg-cyan-400/5"
                    >
                      <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-slate-600">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-slate-100">
                            {f.automate.nom}
                          </p>
                          <span
                            className="shrink-0 text-[11px] font-bold tabular-nums"
                            style={{ color: LEVEL_META[levelOf(f.health)].color }}
                          >
                            {f.health}%
                          </span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#05080F]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${f.health ?? 0}%`,
                              backgroundColor: LEVEL_META[levelOf(f.health)].color
                            }}
                          />
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex flex-col items-center gap-1 pb-4 pt-2 text-center">
          <p className="text-[9px] uppercase tracking-[0.3em] text-slate-600">
            BioPlus GalacticOS · {scopeLabel}
          </p>
          {profile && user && (
            <p className="text-[10px] text-slate-700">
              {user.email} · {window.location.hostname}
            </p>
          )}
        </footer>
    </div>
  );
}
