import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { edge } from '../lib/edge';
import { supabase, type Automate, type Laboratoire, type TicketWithAutomate } from '../lib/supabaseClient';
import {
  byAutomate,
  exportCsv,
  downloadCsv,
  fmtDuration,
  laboStats,
  type ClientUser,
  type LaboInfo,
  type LaboStats
} from '../lib/analytics';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';

const PALETTES = [
  'from-teal-600 to-emerald-700',
  'from-sky-600 to-blue-700',
  'from-violet-600 to-purple-700',
  'from-rose-500 to-pink-700',
  'from-amber-500 to-orange-600',
  'from-indigo-600 to-blue-700',
  'from-cyan-600 to-teal-700',
  'from-fuchsia-600 to-purple-700'
];

function initials(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('fr-FR', { month: 'short' });
}

export default function Clients() {
  const [laboratoires, setLaboratoires] = useState<Laboratoire[]>([]);
  const [automates, setAutomates] = useState<Automate[]>([]);
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const refreshing = useRef(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    setError(null);
    try {
      const [laboRes, autoRes, tickRes, usersRes] = await Promise.all([
        supabase.from('laboratoires').select('*').eq('est_client', true).order('nom'),
        supabase.from('automates').select('*').order('nom'),
        supabase
          .from('tickets')
          .select('*, automates(id, nom, modele), technicien:profiles!tickets_technicien_id_fkey(full_name)')
          .order('created_at', { ascending: false })
          .limit(1000),
        edge<{ users: ClientUser[] }>('list-users')
      ]);
      if (laboRes.error) setError(laboRes.error.message);
      else setLaboratoires(laboRes.data as Laboratoire[]);
      if (autoRes.error) setError(autoRes.error.message);
      else setAutomates(autoRes.data as Automate[]);
      if (tickRes.error) setError(tickRes.error.message);
      else setTickets(tickRes.data as TicketWithAutomate[]);
      if (usersRes.error) setError(usersRes.error.message);
      else setUsers((usersRes.data?.users ?? []).map((u) => ({ ...u, banned: !!u.banned })));
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(
    () => laboStats(tickets, laboratoires as LaboInfo[], automates, users),
    [tickets, laboratoires, automates, users]
  );

  const filtres = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stats;
    return stats.filter((s) => {
      const hay = [s.labo.nom, s.labo.ville, s.labo.adresse]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [stats, search]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filtres.slice(pageStart, pageStart + PAGE_SIZE);

  const totalMachines = automates.length;
  const totalTickets = tickets.length;
  const enAttente = tickets.filter((t) => t.statut !== 'resolu').length;
  const critiques = tickets.filter((t) => t.priorite === 'critique' && t.statut !== 'resolu').length;

  const parMois = useMemo(() => {
    const now = new Date();
    const months: Array<{ label: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const count = tickets.filter((t) => {
        const td = new Date(t.created_at);
        return `${td.getFullYear()}-${td.getMonth()}` === key;
      }).length;
      months.push({ label: monthLabel(d), count });
    }
    return months;
  }, [tickets]);

  const parStatut = useMemo(() => {
    const s = {
      Ouvertes: tickets.filter((t) => t.statut === 'ouvert').length,
      'En cours': tickets.filter((t) => t.statut === 'en_cours').length,
      Résolues: tickets.filter((t) => t.statut === 'resolu').length
    };
    return Object.entries(s).map(([label, count]) => ({ label, count }));
  }, [tickets]);

  const parPriorite = useMemo(() => {
    const p = {
      normale: tickets.filter((t) => t.priorite === 'normal').length,
      importante: tickets.filter((t) => t.priorite === 'important').length,
      critique: tickets.filter((t) => t.priorite === 'critique').length
    };
    return Object.entries(p).map(([label, count]) => ({ label, count }));
  }, [tickets]);

  const donutColors = ['bg-blue-500', 'bg-amber-500', 'bg-green-500'];
  const maxMois = Math.max(1, ...parMois.map((m) => m.count));
  const maxPrio = Math.max(1, ...parPriorite.map((p) => p.count));
  const topAutos = byAutomate(tickets, automates).slice(0, 4);
  const topMax = Math.max(1, ...topAutos.map((a) => a.count));

  function exportAll() {
    downloadCsv(
      exportCsv(tickets, laboratoires as LaboInfo[], automates, users),
      `reclamations-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function miniStat(nombre: number, label: string, color: string) {
    return (
      <div className="rounded-xl bg-white/10 px-1 py-2 text-center">
        <p className={`text-lg font-bold leading-tight ${color}`}>{nombre}</p>
        <p className="text-[10px] text-white/70">{label}</p>
      </div>
    );
  }

  function clientCard(s: LaboStats, paletteIdx: number) {
    const palette = PALETTES[paletteIdx % PALETTES.length];
    const pct = s.total ? Math.round((s.resolues / s.total) * 100) : 0;
    const enAtt = s.ouvertes + s.enCours;

    return (
      <li key={s.labo.id}>
        <Link to={`/client/${s.labo.id}`} className="card block overflow-hidden p-0 transition hover:shadow-md active:scale-[0.99]">
          <div className={`bg-gradient-to-r ${palette} p-3 text-white`}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-bold backdrop-blur">
                {initials(s.labo.nom)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{s.labo.nom}</p>
                <p className="truncate text-[11px] text-white/80">
                  {[s.labo.ville, s.labo.adresse, s.labo.telephone]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                {s.total} réclamation{s.total > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-base font-bold text-slate-900">{s.automates}</p>
                <p className="text-[10px] text-slate-500">Machines</p>
              </div>
              <div>
                <p className="text-base font-bold text-slate-900">{s.comptes.length}</p>
                <p className="text-[10px] text-slate-500">Comptes</p>
              </div>
              <div>
                <p className={`text-base font-bold ${enAtt ? 'text-amber-600' : 'text-slate-900'}`}>
                  {enAtt}
                </p>
                <p className="text-[10px] text-slate-500">En attente</p>
              </div>
              <div>
                <p className={`text-base font-bold ${s.critiques ? 'text-red-600' : 'text-slate-900'}`}>
                  {s.critiques}
                </p>
                <p className="text-[10px] text-slate-500">Critiques</p>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>Taux de résolution</span>
                <span>
                  {s.total ? `${pct}%` : '—'} · {s.resolues}/{s.total} résolue(s)
                  {s.avgMin !== null ? ` · moy. ${fmtDuration(s.avgMin)}` : ''}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${palette}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <p className="mt-1.5 text-[10px] text-slate-400">
              Dernière activité :{' '}
              {s.dernierTicket
                ? new Date(s.dernierTicket).toLocaleDateString('fr-FR')
                : 'aucune'}
            </p>
            <p className="mt-2 rounded-lg bg-teal-50 px-2 py-1.5 text-center text-[11px] font-semibold text-teal-700">
              Ouvrir la fiche client
            </p>
          </div>
        </Link>
      </li>
    );
  }

  if (loading && tickets.length === 0)
    return <Spinner label="Chargement du portefeuille clients..." />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
      <header className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 to-emerald-700 p-4 text-white shadow-lg shadow-teal-900/20">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="page-title text-lg font-bold">Portefeuille clients</h1>
            <p className="mt-0.5 truncate text-xs text-teal-100">
              {stats.length} client(s) · {totalMachines} machine(s) · {totalTickets} réclamation(s)
            </p>
          </div>
          <button
            onClick={exportAll}
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/25"
          >
            Export CSV
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {miniStat(stats.length, 'Clients', 'text-white')}
          {miniStat(totalMachines, 'Machines', 'text-white')}
          {miniStat(enAttente, 'En attente', 'text-amber-200')}
          {miniStat(critiques, 'Critiques', 'text-red-300')}
        </div>
      </header>

      <div className="card mb-3">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Réclamations — 12 derniers mois
        </p>
        <div className="flex h-28 items-end gap-1">
          {parMois.map((m, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] font-semibold text-slate-500">{m.count}</span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-teal-600 to-emerald-500"
                style={{ height: `${Math.round((m.count / maxMois) * 100)}%`, minHeight: m.count ? 4 : 2 }}
              />
              <span className="text-[9px] text-slate-400">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Par statut
          </p>
          <div className="relative mx-auto h-24 w-24">
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `conic-gradient(#3b82f6 0 ${(parStatut[0].count / Math.max(1, totalTickets)) * 360}deg, #f59e0b ${(parStatut[0].count / Math.max(1, totalTickets)) * 360}deg ${((parStatut[0].count + parStatut[1].count) / Math.max(1, totalTickets)) * 360}deg, #22c55e ${((parStatut[0].count + parStatut[1].count) / Math.max(1, totalTickets)) * 360}deg 360deg)`
              }}
            />
            <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white text-base font-bold text-slate-800">
              {totalTickets}
            </div>
          </div>
          <ul className="mt-2 space-y-1">
            {parStatut.map((s, i) => (
              <li key={s.label} className="flex items-center gap-1.5 text-[11px]">
                <span className={`h-2 w-2 rounded-full ${donutColors[i]}`} />
                <span className="flex-1 text-slate-600">{s.label}</span>
                <span className="font-bold text-slate-900">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Par priorité
          </p>
          <ul className="space-y-2.5">
            {parPriorite.map((p, i) => {
              const colors = ['bg-slate-300', 'bg-amber-400', 'bg-red-500'];
              return (
                <li key={p.label} className="text-[11px]">
                  <div className="mb-0.5 flex justify-between text-slate-600">
                    <span>{p.label}</span>
                    <span className="font-bold text-slate-900">{p.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${colors[i]}`}
                      style={{ width: `${Math.round((p.count / maxPrio) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <input
        type="search"
        placeholder="Rechercher un client (nom, ville, adresse)..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="input mb-3"
      />

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {stats.length === 0 ? (
        <div className="card bg-slate-100 text-center">
          <p className="text-sm text-slate-500">Aucun laboratoire pour le moment.</p>
        </div>
      ) : filtres.length === 0 ? (
        <div className="card bg-slate-100 text-center">
          <p className="text-sm text-slate-500">Aucun client ne correspond à « {search} ».</p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{pageItems.map((s, i) => clientCard(s, pageStart + i))}</ul>
          <Pagination page={page} totalItems={filtres.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      {topAutos.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Machines les plus sollicitées
          </p>
          <div className="space-y-1.5">
            {topAutos.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-slate-400">{i + 1}</span>
                <span className="w-32 truncate font-semibold text-slate-700">{a.nom}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-600"
                    style={{ width: `${Math.round((a.count / topMax) * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right font-bold text-slate-700">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link to="/dashboard" className="btn-outline mt-4 w-full">
        Tableau de bord
      </Link>
    </div>
  );
}