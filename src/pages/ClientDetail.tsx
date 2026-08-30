import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, type Automate, type Laboratoire, type TicketWithAutomate } from '../lib/supabaseClient';
import { edge } from '../lib/edge';
import { avgResolution, fmtDuration, type ClientUser } from '../lib/analytics';
import Spinner from '../components/Spinner';

const STATUT_STYLES: Record<string, string> = {
  ouvert: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-amber-100 text-amber-800',
  resolu: 'bg-green-100 text-green-800'
};

const STATUT_LABELS: Record<string, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  resolu: 'Résolu'
};

const PRIORITE_STYLES: Record<string, string> = {
  normal: 'bg-slate-100 text-slate-700',
  important: 'bg-amber-100 text-amber-800',
  critique: 'bg-red-100 text-red-700'
};

const AUTO_STATUT_LABELS: Record<string, string> = {
  actif: 'Actif',
  maintenance: 'Maintenance',
  hors_service: 'Hors service'
};

const AUTO_STATUT_STYLES: Record<string, string> = {
  actif: 'bg-green-100 text-green-800',
  maintenance: 'bg-amber-100 text-amber-800',
  hors_service: 'bg-red-100 text-red-700'
};

const AUTO_STATUT_DOT: Record<string, string> = {
  actif: 'bg-green-500',
  maintenance: 'bg-amber-500',
  hors_service: 'bg-red-500'
};

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

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [labo, setLabo] = useState<Laboratoire | null>(null);
  const [automates, setAutomates] = useState<Automate[]>([]);
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [comptes, setComptes] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    const [laboRes, autoRes, tickRes, usersRes] = await Promise.all([
      supabase.from('laboratoires').select('*').eq('id', id!).single(),
      supabase.from('automates').select('*').eq('laboratoire_id', id!).order('nom'),
      supabase
        .from('tickets')
        .select('*, automates(id, nom, modele), technicien:profiles!tickets_technicien_id_fkey(full_name)')
        .eq('laboratoire_id', id!)
        .order('created_at', { ascending: false })
        .limit(500),
      edge<{ users: ClientUser[] }>('list-users')
    ]);
    if (laboRes.error) setError(laboRes.error.message);
    else setLabo(laboRes.data as Laboratoire);
    if (autoRes.error) setError(autoRes.error.message);
    else setAutomates(autoRes.data as Automate[]);
    if (tickRes.error) setError(tickRes.error.message);
    else setTickets(tickRes.data as TicketWithAutomate[]);
    if (usersRes.error) setError(usersRes.error.message);
    else setComptes((usersRes.data?.users ?? []).filter((u) => u.laboratoire_id === id));
    setLoading(false);
  }

  useEffect(() => {
    if (id) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const stats = useMemo(() => {
    const ouvertes = tickets.filter((t) => t.statut === 'ouvert').length;
    const enCours = tickets.filter((t) => t.statut === 'en_cours').length;
    const resolues = tickets.filter((t) => t.statut === 'resolu').length;
    const critiques = tickets.filter((t) => t.priorite === 'critique').length;
    const enAttente = tickets.length - resolues;
    return {
      ouvertes,
      enCours,
      resolues,
      critiques,
      enAttente,
      total: tickets.length,
      avg: avgResolution(tickets),
      rate: tickets.length ? Math.round((resolues / tickets.length) * 100) : 0
    };
  }, [tickets]);

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

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>, automate: Automate) {
    const file = e.target.files?.[0];
    if (!file || !automate) return;
    if (!file.type.startsWith('image/')) {
      setError('Seules les images JPEG/PNG/WebP sont autorisées.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image trop volumineuse (max 5 Mo).');
      return;
    }
    setUploadingId(automate.id);
    setError(null);
    try {
      const safeName = file.name.replace(/[^\w.-]/g, '_');
      const path = `${automate.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('machine-photos')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from('machine-photos').getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from('automates')
        .update({ photo_url: pub.publicUrl })
        .eq('id', automate.id);
      if (dbErr) throw new Error(dbErr.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingId(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeClient() {
    if (!labo) return;
    if (!window.confirm(`Supprimer définitivement le CLIENT ${labo.nom} ET son laboratoire (machines, réclamations, historique) ?`)) return;
    if (!window.confirm('Cette action est IRREVERSIBLE. Confirmer ?')) return;
    setDeleting(true);
    setError(null);
    const user_id = comptes[0]?.id;
    const { error: delErr } = user_id
      ? await edge('update-user', { user_id, action: 'delete', delete_laboratoire: true })
      : await edge('update-user', { action: 'delete_laboratoire', laboratoire_id: labo.id });
    setDeleting(false);
    if (delErr) setError(delErr.message);
    else navigate('/clients', { replace: true });
  }

  if (loading && !labo) return <Spinner label="Chargement de la fiche client..." />;

  if (!labo)
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
        <p className="card text-sm text-red-700">{error ?? 'Client introuvable.'}</p>
        <Link to="/clients" className="btn-outline mt-3 w-full">
          Retour au portefeuille
        </Link>
      </div>
    );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
      <header className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-emerald-700 to-green-700 p-4 text-white shadow-lg shadow-teal-900/20">
        <Link to="/clients" className="text-xs font-semibold text-teal-100 hover:underline">
          ← Portefeuille clients
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg font-bold backdrop-blur">
            {initials(labo.nom)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{labo.nom}</h1>
            <p className="truncate text-xs text-teal-100">
              {[labo.ville, labo.adresse, labo.telephone].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="text-[10px] text-teal-100/80">
              Client depuis le {new Date(labo.created_at).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            [stats.total, 'Réclamations', 'text-white'],
            [automates.length, 'Machines', 'text-white'],
            [stats.enAttente, 'En attente', 'text-amber-200'],
            [stats.critiques, 'Critiques', 'text-red-300']
          ].map(([n, l, c]) => (
            <div key={l as string} className="rounded-xl bg-white/10 px-1 py-2 text-center">
              <p className={`text-lg font-bold leading-tight ${c as string}`}>{n as number}</p>
              <p className="text-[10px] text-white/70">{l as string}</p>
            </div>
          ))}
        </div>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card mb-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Taux de résolution
        </p>
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span className="font-bold text-slate-900">{stats.rate}%</span>
          <span>
            {stats.resolues}/{stats.total} résolue(s) · moy. {fmtDuration(stats.avg)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-600"
            style={{ width: `${stats.rate}%` }}
          />
        </div>
      </div>

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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="card mb-3">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Répartition par statut
        </p>
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0">
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `conic-gradient(#3b82f6 0 ${(parStatut[0].count / Math.max(1, stats.total)) * 360}deg, #f59e0b ${(parStatut[0].count / Math.max(1, stats.total)) * 360}deg ${((parStatut[0].count + parStatut[1].count) / Math.max(1, stats.total)) * 360}deg, #22c55e ${((parStatut[0].count + parStatut[1].count) / Math.max(1, stats.total)) * 360}deg 360deg)`
              }}
            />
            <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white text-sm font-bold text-slate-800">
              {stats.total}
            </div>
          </div>
          <ul className="flex-1 space-y-1.5">
            {parStatut.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 text-xs">
                <span className={`h-2.5 w-2.5 rounded-full ${donutColors[i]}`} />
                <span className="flex-1 text-slate-600">{s.label}</span>
                <span className="font-bold text-slate-900">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Répartition par priorité
        </p>
        <ul className="space-y-2">
          {parPriorite.map((p, i) => {
            const colors = ['bg-slate-300', 'bg-amber-400', 'bg-red-500'];
            return (
              <li key={p.label} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-slate-600">{p.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${colors[i]}`}
                    style={{ width: `${Math.round((p.count / maxPrio) * 100)}%` }}
                  />
                </div>
                <span className="w-6 text-right font-bold text-slate-900">{p.count}</span>
              </li>
            );
          })}
        </ul>
      </div>
      </div>

      <div className="card mb-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Machines ({automates.length})
        </p>
        {automates.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Aucune machine enregistrée pour ce client.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {automates.map((a) => {
              const nb = tickets.filter((t) => t.automate_id === a.id).length;
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2">
                  {a.photo_url ? (
                    <img
                      src={a.photo_url}
                      alt={a.nom}
                      className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-50 to-emerald-100 text-[9px] font-bold text-teal-700">
                      PAS DE<br />PHOTO
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${AUTO_STATUT_DOT[a.statut ?? 'actif'] ?? 'bg-slate-300'}`} />
                      <p className="truncate text-sm font-bold text-slate-800">{a.nom}</p>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">
                      {a.modele ?? '—'}
                      {a.numero_serie ? ` · ${a.numero_serie}` : ''}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`badge ${AUTO_STATUT_STYLES[a.statut ?? 'actif'] ?? ''}`}>
                        {AUTO_STATUT_LABELS[a.statut ?? 'actif']}
                      </span>
                      <span className={`badge ${nb > 0 ? 'bg-teal-100 text-teal-800' : 'bg-slate-200/60 text-slate-500'}`}>
                        {nb} récl.
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Link
                      to={`/automate/${a.id}`}
                      className="rounded-lg bg-teal-600 px-2 py-1 text-center text-[10px] font-semibold text-white hover:bg-teal-700"
                    >
                      QR
                    </Link>
                    <label className="cursor-pointer rounded-lg border border-teal-600 px-2 py-1 text-center text-[10px] font-semibold text-teal-700 hover:bg-teal-50">
                      {uploadingId === a.id ? '...' : 'Photo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingId !== null}
                        onChange={(e) => onPhoto(e, a)}
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card mb-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Comptes du client ({comptes.length})
        </p>
        {comptes.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Aucun compte.</p>
        ) : (
          <ul className="space-y-1">
            {comptes.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs">
                <span className="truncate text-slate-700">{u.full_name ?? u.email}</span>
                <span className="badge shrink-0 bg-slate-200/70 text-slate-600">
                  {u.role === 'responsable' ? 'Responsable' : u.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card mb-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Historique des réclamations ({stats.total})
        </p>
        {tickets.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Aucune réclamation pour ce client.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-xl border border-slate-100 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    <span className={`badge ${STATUT_STYLES[t.statut]}`}>{STATUT_LABELS[t.statut]}</span>
                    <span className={`badge ${PRIORITE_STYLES[t.priorite]}`}>{t.priorite}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">#{t.id.slice(0, 6)}</span>
                </div>
                <p className="mt-1.5 text-xs font-semibold text-slate-800">
                  {t.automates?.nom ?? 'Automate supprimé'}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                  {t.message_erreur ?? t.description ?? 'Sans message'}
                </p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>
                    {new Date(t.created_at).toLocaleDateString('fr-FR')} ·{' '}
                    {new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {t.technicien?.full_name ? ` · ${t.technicien.full_name}` : ''}
                  </span>
                  <Link to={`/ticket/${t.id}`} className="font-semibold text-teal-700 hover:underline">
                    Fiche
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/clients" className="btn-outline w-full">
        Portefeuille clients
      </Link>

      <button
        type="button"
        onClick={removeClient}
        disabled={deleting}
        className="btn-danger mt-3 w-full"
      >
        {deleting ? 'Suppression...' : 'Supprimer ce client + laboratoire'}
      </button>
    </div>
  );
}