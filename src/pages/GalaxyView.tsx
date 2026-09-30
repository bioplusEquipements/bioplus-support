import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { C, relTime } from '../lib/galacticos';

interface GalaxyAutomate {
  id: string;
  nom: string;
  modele: string | null;
  statut: string | null;
  laboratoire_id: string;
}

interface GalaxyLabo {
  id: string;
  nom: string;
}

interface GalaxyTicket {
  automate_id: string;
  priorite: string;
  statut: string;
  created_at: string;
}

const W = 1000;
const H = 620;
const CX = W / 2;
const CY = H / 2;
const RX = 340;
const RY = 210;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

const STATUT_COLOR: Record<string, string> = {
  actif: C.emerald,
  maintenance: C.warning,
  hors_service: C.critical
};

export default function GalaxyView() {

  const [automates, setAutomates] = useState<GalaxyAutomate[]>([]);
  const [labos, setLabos] = useState<GalaxyLabo[]>([]);
  const [tickets, setTickets] = useState<GalaxyTicket[]>([]);
  const [selected, setSelected] = useState<GalaxyAutomate | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(0);

  useEffect(() => {
    const channel = supabase
      .channel('galaxy-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automates' }, () =>
        setLive((n) => n + 1)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from('automates').select('id, nom, modele, statut, laboratoire_id').order('nom', { ascending: true }).limit(500),
      supabase.from('laboratoires').select('id, nom').order('nom', { ascending: true }).limit(200),
      supabase.from('tickets').select('automate_id, priorite, statut, created_at').order('created_at', { ascending: false }).limit(100)
    ]).then(([a, l, t]) => {
      setAutomates((a.data as GalaxyAutomate[] | null) ?? []);
      setLabos((l.data as GalaxyLabo[] | null) ?? []);
      setTickets((t.data as GalaxyTicket[] | null) ?? []);
      setLoading(false);
    });
  }, [live]);

  const positions = useMemo(() => {
    const byLabo = new Map<string, { x: number; y: number }>();
    labos.forEach((lab, i) => {
      const angle = (i / Math.max(1, labos.length)) * 2 * Math.PI - Math.PI / 2;
      byLabo.set(lab.id, {
        x: CX + RX * Math.cos(angle),
        y: CY + RY * Math.sin(angle)
      });
    });
    const nodes = automates.map((a) => {
      const labPos = byLabo.get(a.laboratoire_id) ?? { x: CX, y: CY };
      const seed = hashId(a.id);
      const angle = (seed % 628) / 100;
      const radius = 40 + (seed % 40);
      return {
        automate: a,
        x: labPos.x + radius * Math.cos(angle),
        y: labPos.y + radius * Math.sin(angle),
        labo: labos.find((l) => l.id === a.laboratoire_id)?.nom ?? 'Labo inconnu'
      };
    });
    return { byLabo, nodes };
  }, [automates, labos]);

  const selectedStats = useMemo(() => {
    if (!selected) return null;
    const open = tickets.filter((t) => t.automate_id === selected.id && t.statut !== 'resolu');
    const critical = open.filter((t) => t.priorite === 'critique').length;
    const last = tickets.find((t) => t.automate_id === selected.id);
    return { open: open.length, critical, last: last?.created_at ?? null };
  }, [selected, tickets]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#05080F] text-slate-300">
        <div className="h-2 w-2 animate-pulse rounded-full bg-[#00E5FF] shadow-[0_0_12px_#00E5FF]" />
        <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-cyan-400/60">
          Cartographie du réseau…
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col text-slate-300 antialiased">
      {/* Identite et deconnexion sont desormais dans le Layout. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/dashboard"
          className="text-[11px] font-semibold tracking-widest text-cyan-400/80 transition hover:text-cyan-300"
        >
          ← CENTRE DE CONTRÔLE
        </Link>
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
          Galaxy View · Réseau en temps réel
        </p>
      </div>

      <main className="relative mx-auto max-w-7xl px-4 py-5 lg:px-6">
        {automates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 py-20">
            <p className="text-sm text-slate-400">Aucun automate visible (RLS) — le réseau est vide.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
            <section className="relative overflow-hidden rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 shadow-lg shadow-black/40">
              <svg viewBox={`0 0 ${W} ${H}`} className="h-[560px] w-full">
                {/* lignes orbitales */}
                {labos.map((lab) => {
                  const p = positions.byLabo.get(lab.id);
                  if (!p) return null;
                  return (
                    <circle
                      key={lab.id}
                      cx={p.x}
                      cy={p.y}
                      r="62"
                      fill="none"
                      stroke={C.cyan}
                      strokeOpacity="0.08"
                      strokeDasharray="3 5"
                    />
                  );
                })}
                {/* liens labo → labo (toile de fond) */}
                {labos.map((lab, i) => {
                  const p = positions.byLabo.get(lab.id);
                  const next = positions.byLabo.get(labos[(i + 1) % labos.length]?.id);
                  if (!p || !next) return null;
                  return (
                    <line
                      key={`line-${lab.id}`}
                      x1={p.x}
                      y1={p.y}
                      x2={next.x}
                      y2={next.y}
                      stroke={C.violet}
                      strokeOpacity="0.12"
                    />
                  );
                })}
                {/* laboratoires */}
                {labos.map((lab) => {
                  const p = positions.byLabo.get(lab.id);
                  if (!p) return null;
                  return (
                    <g key={lab.id}>
                      <circle cx={p.x} cy={p.y} r="5" fill={C.violet} style={{ filter: `drop-shadow(0 0 8px ${C.violet})` }} />
                      <text
                        x={p.x}
                        y={p.y - 16}
                        textAnchor="middle"
                        fontSize="10"
                        letterSpacing="2"
                        fill={C.violet}
                        opacity="0.9"
                      >
                        {lab.nom.toUpperCase()}
                      </text>
                    </g>
                  );
                })}
                {/* automates */}
                {positions.nodes.map((n) => {
                  const color = STATUT_COLOR[n.automate.statut ?? ''] ?? C.cyan;
                  const isSelected = selected?.id === n.automate.id;
                  return (
                    <g
                      key={n.automate.id}
                      onClick={() => setSelected(n.automate)}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={isSelected ? 9 : 6}
                        fill={color}
                        style={{ filter: `drop-shadow(0 0 10px ${color})` }}
                      >
                        <title>
                          {n.automate.nom} ({n.labo}) — {n.automate.statut ?? 'inconnu'}
                        </title>
                      </circle>
                      <text
                        x={n.x}
                        y={n.y + 20}
                        textAnchor="middle"
                        fontSize="8"
                        fill={isSelected ? '#F8FAFC' : '#64748B'}
                        className="pointer-events-none select-none"
                      >
                        {n.automate.nom.length > 14 ? `${n.automate.nom.slice(0, 12)}…` : n.automate.nom}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <p className="pointer-events-none absolute bottom-2 left-3 text-[9px] uppercase tracking-[0.25em] text-slate-600">
                {labos.length} laboratoires · {automates.length} automates · cliquez sur un nœud
              </p>
            </section>

            {/* PANNEAU SÉLECTION */}
            <aside className="rounded-xl border border-cyan-400/10 bg-[#0B1220]/80 p-4 shadow-lg shadow-black/40">
              {!selected ? (
                <div className="py-16 text-center">
                  <p className="text-2xl opacity-30">✦</p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                    Sélectionnez un nœud
                  </p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    Les détails de l'unité apparaîtront ici.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/70">
                    Unité sélectionnée
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-100">{selected.nom}</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {selected.modele ?? 'Modèle inconnu'}
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                      <span className="text-[9px] uppercase tracking-widest text-slate-500">État</span>
                      <span
                        className="text-xs font-bold"
                        style={{ color: STATUT_COLOR[selected.statut ?? ''] ?? C.cyan }}
                      >
                        {selected.statut ?? 'inconnu'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                      <span className="text-[9px] uppercase tracking-widest text-slate-500">Tickets ouverts</span>
                      <span className="text-xs font-bold text-slate-200">
                        {selectedStats?.open ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                      <span className="text-[9px] uppercase tracking-widest text-slate-500">Critiques</span>
                      <span
                        className="text-xs font-bold"
                        style={{ color: (selectedStats?.critical ?? 0) > 0 ? C.critical : C.emerald }}
                      >
                        {selectedStats?.critical ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-[#05080F]/60 px-3 py-2">
                      <span className="text-[9px] uppercase tracking-widest text-slate-500">Dernier événement</span>
                      <span className="text-xs font-semibold text-slate-200">
                        {selectedStats?.last ? relTime(selectedStats.last) : 'aucun'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <Link
                      to={`/automate/${selected.id}`}
                      className="rounded-lg bg-gradient-to-r from-[#00E5FF]/20 to-[#00FFA3]/20 px-3 py-2 text-center text-xs font-semibold text-cyan-200 transition hover:from-[#00E5FF]/30 hover:to-[#00FFA3]/30"
                    >
                      Fiche complète →
                    </Link>
                    <Link
                      to={`/ticket/new?automate_id=${selected.id}`}
                      className="rounded-lg border border-cyan-400/30 px-3 py-2 text-center text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/10"
                    >
                      + Réclamation
                    </Link>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}