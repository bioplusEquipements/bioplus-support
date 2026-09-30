import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, type Automate } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import Spinner from '../components/Spinner';

const STATUT_LABELS: Record<string, string> = {
  actif: 'Actif',
  maintenance: 'En maintenance',
  hors_service: 'Hors service'
};

const STATUT_STYLES: Record<string, string> = {
  actif: 'bg-green-100 text-green-800',
  maintenance: 'bg-amber-100 text-amber-800',
  hors_service: 'bg-red-100 text-red-700'
};

const basename = window.location.pathname.startsWith('/bioplus-support')
  ? '/bioplus-support'
  : '';

export default function Automates() {
  const { profile } = useAuth();
  const [automates, setAutomates] = useState<Automate[]>([]);
  const [laboratoires, setLaboratoires] = useState<{ id: string; nom: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<Automate | 'new' | null>(null);
  const [qr, setQr] = useState<Automate | null>(null);
  const [form, setForm] = useState({
    nom: '',
    modele: '',
    numero_serie: '',
    statut: 'actif',
    laboratoire_id: ''
  });

  async function refresh() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('automates')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setAutomates(data as Automate[]);
    if (profile?.role === 'admin') {
      const { data: labos } = await supabase
        .from('laboratoires')
        .select('id, nom')
        .eq('est_client', true)
        .order('nom');
      if (labos) setLaboratoires(labos);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = profile?.role === 'admin';

  const groupes = useMemo(() => {
    if (!isAdmin) return [];
    const parLabo = new Map<string, Automate[]>();
    for (const a of automates) {
      const liste = parLabo.get(a.laboratoire_id) ?? [];
      liste.push(a);
      parLabo.set(a.laboratoire_id, liste);
    }
    return [...parLabo.entries()].map(([laboId, liste]) => ({
      laboId,
      laboNom: laboratoires.find((l) => l.id === laboId)?.nom ?? 'Laboratoire inconnu',
      automates: liste
    }));
  }, [isAdmin, automates, laboratoires]);

  function openForm(a: Automate | 'new') {
    setEditing(a);
    setError(null);
    setForm(
      a === 'new'
        ? { nom: '', modele: '', numero_serie: '', statut: 'actif', laboratoire_id: '' }
        : {
            nom: a.nom,
            modele: a.modele ?? '',
            numero_serie: a.numero_serie ?? '',
            statut: a.statut ?? 'actif',
            laboratoire_id: a.laboratoire_id ?? ''
          }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom.trim()) return;
    const isAdmin = profile?.role === 'admin';
    const laboId = isAdmin ? form.laboratoire_id : profile?.laboratoire_id;
    if (!laboId) {
      setError(
        isAdmin
          ? 'Choisissez le laboratoire propriétaire de la machine.'
          : "Votre compte n'est rattaché à aucun laboratoire. Contactez l'administrateur BioPlus pour être rattaché avant d'ajouter des automates."
      );
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      nom: form.nom.trim(),
      modele: form.modele.trim() || null,
      numero_serie: form.numero_serie.trim() || null,
      statut: form.statut,
      laboratoire_id: laboId
    };
    const { error: err } =
      editing === 'new'
        ? await supabase.from('automates').insert(payload)
        : await supabase.from('automates').update(payload).eq('id', (editing as Automate).id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(null);
    refresh();
  }

  async function removeAutomate(a: Automate) {
    const { count, error: countErr } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('automate_id', a.id);
    if (countErr) {
      setError(countErr.message);
      return;
    }
    if (count && count > 0) {
      setError(
        `Impossible de supprimer « ${a.nom} » : ${count} ticket(s) lui sont rattachés. Mettez-le « Hors service » à la place.`
      );
      return;
    }
    if (!window.confirm(`Supprimer définitivement l'automate « ${a.nom} » ?`)) return;
    setBusy(true);
    const { error: err } = await supabase.from('automates').delete().eq('id', a.id);
    setBusy(false);
    if (err) setError(err.message);
    else refresh();
  }

  if (loading) return <Spinner label="Chargement des automates..." />;

  function renderAutomateCard(a: Automate) {
    return (
      <li key={a.id} className="card">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{a.nom}</p>
            <p className="truncate text-xs text-slate-500">
              {a.modele ?? '—'}
              {a.numero_serie ? ` · ${a.numero_serie}` : ''}
            </p>
          </div>
          <span className={`badge shrink-0 ${STATUT_STYLES[a.statut ?? 'actif'] ?? ''}`}>
            {STATUT_LABELS[a.statut ?? 'actif']}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setQr(a)} className="btn-outline px-2 py-1 text-xs">
            QR code
          </button>
          <button
            onClick={() => openForm(a)}
            disabled={busy}
            className="btn-outline px-2 py-1 text-xs"
          >
            Modifier
          </button>
          <button
            onClick={() => removeAutomate(a)}
            disabled={busy}
            className="btn-outline border-red-200 text-red-600 px-2 py-1 text-xs"
          >
            Supprimer
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 page-title">Parc d'automates</h1>
          <p className="text-xs text-slate-500">Gestion des machines de votre laboratoire</p>
        </div>
        <Link to="/dashboard" className="btn-outline px-3 py-1.5 text-xs">
          Tableau de bord
        </Link>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">{automates.length} automate(s)</h2>
        {profile?.laboratoire_id ? (
          <button onClick={() => openForm('new')} className="btn-primary px-3 py-1.5 text-xs">
            + Nouvel automate
          </button>
        ) : (
          <span className="badge bg-amber-100 text-amber-800">
            Compte en attente : aucune machine
          </span>
        )}
      </div>

      {automates.length === 0 ? (
        <div className="card bg-slate-100 text-center">
          <p className="text-sm text-slate-500">Aucun automate. Ajoutez votre première machine.</p>
        </div>
      ) : isAdmin ? (
        <div className="space-y-3">
          {groupes.map((g) => (
            <section key={g.laboId}>
              <h3 className="mb-1 text-sm font-bold text-slate-800">
                {g.laboNom}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  · {g.automates.length} machine(s)
                </span>
              </h3>
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{g.automates.map(renderAutomateCard)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{automates.map(renderAutomateCard)}</ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <form onSubmit={handleSubmit} className="card w-full max-w-md space-y-3 lg:max-w-xl">
            <h3 className="text-base font-bold text-slate-900">
              {editing === 'new' ? 'Nouvel automate' : `Modifier : ${editing.nom}`}
            </h3>
            <input
              required
              placeholder="Nom (ex : Pentra 60 CXP)"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              className="input w-full"
            />
            {profile?.role === 'admin' && (
              <select
                required
                value={form.laboratoire_id}
                onChange={(e) => setForm({ ...form, laboratoire_id: e.target.value })}
                className="input w-full"
              >
                <option value="">— Laboratoire propriétaire —</option>
                {laboratoires.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nom}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="Modèle (ex : Horiba ABX Pentra 60)"
              value={form.modele}
              onChange={(e) => setForm({ ...form, modele: e.target.value })}
              className="input w-full"
            />
            <input
              type="text"
              placeholder="N° de série (ex : P60-0002)"
              value={form.numero_serie}
              onChange={(e) => setForm({ ...form, numero_serie: e.target.value })}
              className="input w-full"
            />
            <select
              value={form.statut}
              onChange={(e) => setForm({ ...form, statut: e.target.value })}
              className="input w-full"
            >
              <option value="actif">Actif</option>
              <option value="maintenance">En maintenance</option>
              <option value="hors_service">Hors service</option>
            </select>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-primary flex-1">
                {busy ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="btn-outline flex-1"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="qr-print-area card w-full max-w-xs text-center">
            <h3 className="text-base font-bold text-slate-900">{qr.nom}</h3>
            <p className="mb-3 text-xs text-slate-500">
              {qr.modele ?? ''}
              {qr.numero_serie ? ` · ${qr.numero_serie}` : ''}
            </p>
            <div className="mx-auto w-fit rounded-lg bg-white p-3">
              <QRCodeSVG
                value={`${window.location.origin}${basename}/automate/${qr.id}`}
                size={200}
                level="M"
              />
            </div>
            <p className="mt-3 break-all text-[10px] text-slate-400">
              {`${window.location.origin}${basename}/automate/${qr.id}`}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Collez ce QR sur l'automate : le client le scanne pour ouvrir la fiche de la
              machine et créer une réclamation.
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => window.print()} className="btn-primary flex-1">
                Imprimer
              </button>
              <button onClick={() => setQr(null)} className="btn-outline flex-1">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}