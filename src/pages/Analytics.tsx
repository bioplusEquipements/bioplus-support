import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { edge } from '../lib/edge';
import { supabase, type Automate, type Laboratoire, type TicketWithAutomate } from '../lib/supabaseClient';
import {
  activityByDay,
  avgResolution,
  byAutomate,
  daysAgo,
  exportCsv,
  downloadCsv,
  fmtDuration,
  prioriteCount,
  resolutionMinutes,
  statutCount,
  techStats,
  type ClientUser,
  type LaboInfo
} from '../lib/analytics';
import Spinner from '../components/Spinner';

const PRIORITE_LABELS: Record<string, string> = {
  normal: 'Normal',
  important: 'Important',
  critique: 'Critique'
};

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">{value}</span>
      </div>
      <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
    </div>
  );
}

export default function Analytics() {
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [automates, setAutomates] = useState<Automate[]>([]);
  const [laboratoires, setLaboratoires] = useState<Laboratoire[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    const [tickRes, autoRes, laboRes, usersRes] = await Promise.all([
      supabase
        .from('tickets')
        .select('*, automates(id, nom, modele), technicien:profiles!tickets_technicien_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase.from('automates').select('*'),
      supabase.from('laboratoires').select('*').eq('est_client', true),
      edge<{ users: ClientUser[] }>('list-users')
    ]);
    if (tickRes.error) setError(tickRes.error.message);
    else setTickets(tickRes.data as TicketWithAutomate[]);
    if (autoRes.error) setError(autoRes.error.message);
    else setAutomates(autoRes.data as Automate[]);
    if (laboRes.error) setError(laboRes.error.message);
    else setLaboratoires(laboRes.data as Laboratoire[]);
    if (usersRes.error) setError(usersRes.error.message);
    else setUsers((usersRes.data?.users ?? []).map((u) => ({ ...u, banned: !!u.banned })));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);

  const total = tickets.length;
  const resolues = statutCount(tickets, 'resolu');
  const rate = total ? Math.round((resolues / total) * 100) : 0;
  const avg = avgResolution(tickets);
  const activity = useMemo(() => activityByDay(tickets, 30), [tickets]);
  const maxDay = Math.max(...activity, 1);
  const techs = useMemo(() => techStats(tickets, users), [tickets, users]);
  const machines = useMemo(() => byAutomate(tickets, automates), [tickets, automates]);

  const critiques = tickets.filter((t) => t.priorite === 'critique');
  const critiquesResolues = critiques.filter((t) => t.statut === 'resolu');
  const slaOk = critiquesResolues.filter((t) => (resolutionMinutes(t) ?? Infinity) <= 1440);
  const slaRate = critiquesResolues.length
    ? Math.round((slaOk.length / critiquesResolues.length) * 100)
    : null;

  const cutoff7j = Date.now() - 7 * 86400000;
  const alerts = machines
    .map((m) => ({
      ...m,
      critiques7j: critiques.filter(
        (t) => t.automate_id === m.id && new Date(t.created_at).getTime() >= cutoff7j
      ).length
    }))
    .filter((m) => m.critiques7j >= 2);

  function exportAll() {
    downloadCsv(
      exportCsv(tickets, laboratoires as LaboInfo[], automates, users),
      `reclamations-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  if (loading && tickets.length === 0) return <Spinner label="Calcul des indicateurs..." />;

  return (
    <div className="flex flex-col">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 page-title">Analyse & efficacité</h1>
          <p className="text-xs text-slate-500">Tableau de bord expert BioPlus</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportAll} className="btn-outline px-3 py-1.5 text-xs">
            Export CSV
          </button>
          <Link to="/dashboard" className="btn-outline px-3 py-1.5 text-xs">
            Tableau de bord
          </Link>
        </div>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-slate-900">{total}</p>
          <p className="text-xs text-slate-500">Réclamations (tous clients)</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{rate}%</p>
          <p className="text-xs text-slate-500">Taux de résolution</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-teal-700">{fmtDuration(avg)}</p>
          <p className="text-xs text-slate-500">Temps moyen de résolution</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-amber-600">{daysAgo(tickets, 7)}</p>
          <p className="text-xs text-slate-500">Réclamations 7 derniers jours</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="card mb-4 space-y-2">
        <h2 className="text-sm font-bold text-slate-900">Répartition par statut</h2>
        <Bar label="Ouvertes" value={statutCount(tickets, 'ouvert')} max={total} color="bg-blue-500" />
        <Bar label="En cours" value={statutCount(tickets, 'en_cours')} max={total} color="bg-amber-500" />
        <Bar label="Résolues" value={resolues} max={total} color="bg-green-500" />
        <div className="pt-1">
          {(['normal', 'important', 'critique'] as const).map((p) => (
            <div key={p} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Priorité {PRIORITE_LABELS[p]}</span>
              <span className="font-semibold text-slate-900">{prioriteCount(tickets, p)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 text-sm font-bold text-slate-900">SLA — critiques résolues en moins de 24 h</h2>
        <div className="flex items-end gap-3">
          <p className="text-2xl font-bold text-red-600">{slaRate === null ? '—' : `${slaRate}%`}</p>
          <p className="pb-1 text-xs text-slate-500">
            {slaOk.length} sur {critiquesResolues.length} réclamation(s) critique(s) résolue(s)
            dans les 24 h · {critiques.length - critiquesResolues.length} critique(s) encore ouverte(s)
          </p>
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="card mb-4 border-red-200 bg-red-50">
          <h2 className="mb-1 text-sm font-bold text-red-800">
            Alertes — machines à problème (2+ critiques / 7 jours)
          </h2>
          <ul className="space-y-1">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-red-700">{a.nom}</span>
                <span className="badge bg-red-100 text-red-700">{a.critiques7j} critique(s)</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mb-4">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Activité — 30 derniers jours</h2>
        <div className="flex h-16 items-end gap-0.5">
          {activity.map((n, i) => (
            <div
              key={i}
              title={`${n} réclamation(s)`}
              className="min-w-0 flex-1 rounded-t bg-teal-600/70"
              style={{ height: `${Math.max(4, (n / maxDay) * 100)}%` }}
            />
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          {activity.reduce((s, n) => s + n, 0)} réclamation(s) sur 30 jours
        </p>
      </section>
      </div>

      <section className="card mb-4">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Efficacité des techniciens</h2>
        {techs.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun technicien BioPlus.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {techs.map((t) => (
              <li key={t.id}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">{t.full_name ?? t.email}</span>
                  <span className="text-slate-500">
                    {t.assigned} assignée(s) · {t.resolues} résolue(s)
                  </span>
                </div>
                <Bar
                  label={`Temps moyen : ${fmtDuration(t.avgMin)} · Taux : ${t.rate ?? 0}%`}
                  value={t.resolues}
                  max={Math.max(t.assigned, 1)}
                  color="bg-teal-600"
                />
                <p className="mt-0.5 text-[10px] text-slate-400">
                  En cours : {t.enCours} · Ouvertes : {t.ouvertes}
                  {t.dernierTicket
                    ? ` · Dernière activité : ${new Date(t.dernierTicket).toLocaleDateString('fr-FR')}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="card mb-4">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Machines les plus sollicitées</h2>
        {machines.length === 0 ? (
          <p className="text-xs text-slate-500">Aucune donnée.</p>
        ) : (
          <ul className="space-y-1">
            {machines.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-slate-700">{m.nom}</span>
                <span className="font-semibold text-slate-900">{m.count} réclamation(s)</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Réclamations par laboratoire</h2>
        <ul className="space-y-1">
          {[...laboratoires]
            .map((l) => ({
              nom: l.nom,
              count: tickets.filter((t) => t.laboratoire_id === l.id).length
            }))
            .sort((a, b) => b.count - a.count)
            .map((l) => (
              <li key={l.nom} className="flex items-center justify-between text-xs">
                <span className="truncate text-slate-700">{l.nom}</span>
                <span className="font-semibold text-slate-900">{l.count}</span>
              </li>
            ))}
        </ul>
      </section>
      </div>

      <p className="text-center text-xs text-slate-400">
        Données actualisées toutes les minutes · Téléchargement CSV compatible Excel
      </p>
    </div>
  );
}