import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, type Laboratoire, type Role } from '../lib/supabaseClient';
import { edge } from '../lib/edge';
import { useAuth } from '../contexts/AuthContext';
import Spinner from '../components/Spinner';

interface ManagedUser {
  id: string;
  email: string;
  role: Role;
  statut: 'en_attente' | 'valide';
  laboratoire_id: string | null;
  full_name: string | null;
  is_super_admin: boolean;
  laboratoire_nom: string | null;
  laboratoire_ville: string | null;
  laboratoire_adresse: string | null;
  laboratoire_telephone: string | null;
  created_at: string;
  banned: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur (BioPlus)',
  responsable: 'Responsable (biologiste)',
  technicien: 'Technicien'
};

const ROLE_STYLES: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-800',
  responsable: 'bg-teal-100 text-teal-800',
  technicien: 'bg-slate-100 text-slate-700'
};

export default function AdminUsers() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [laboratoires, setLaboratoires] = useState<Laboratoire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<ManagedUser | null>(null);
  const [approveLabo, setApproveLabo] = useState('');
  const [approveRole, setApproveRole] = useState<Role>('responsable');
  const [approveCreateLabo, setApproveCreateLabo] = useState(false);

  const callerIsSuper = profile?.is_super_admin === true;
  const isAdminAccount = (u: ManagedUser) => u.role === 'admin' && !u.is_super_admin;

  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    laboratoire_id: '',
    role: 'technicien' as Role
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    const [usersRes, labosRes] = await Promise.all([
      edge<{ users: ManagedUser[] }>('list-users', undefined, { noCache: true }),
      supabase.from('laboratoires').select('*').eq('est_client', true).order('nom')
    ]);
    if (usersRes.error) {
      setError(usersRes.error.message);
    } else {
      setUsers(usersRes.data?.users ?? []);
    }
    if (labosRes.error) setError(labosRes.error.message);
    else setLaboratoires(labosRes.data as Laboratoire[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await edge('create-user', {
      email: form.email.trim(),
      password: form.password,
      full_name: form.full_name.trim() || null,
      laboratoire_id: form.laboratoire_id || null,
      role: form.role
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setShowCreate(false);
    setForm({ email: '', password: '', full_name: '', laboratoire_id: '', role: 'technicien' });
    setNotice(`Compte ${form.email} créé.`);
    refresh();
  }

  async function act(user: ManagedUser, action: string, params: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    const { error } = await edge('update-user', { user_id: user.id, action, ...params });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    refresh();
  }

  function changeRole(user: ManagedUser, role: Role) {
    act(user, 'role', { role });
  }

  function changeLabo(user: ManagedUser, laboratoire_id: string) {
    act(user, 'laboratoire', { laboratoire_id: laboratoire_id || null });
  }

  function resetPassword(user: ManagedUser) {
    const password = window.prompt(`Nouveau mot de passe pour ${user.email} (6 caractères min) :`);
    if (!password) return;
    act(user, 'password', { password });
  }

  function changeEmail(user: ManagedUser) {
    const email = window.prompt(`Nouvelle adresse email pour ${user.email} :`, user.email);
    if (!email || email === user.email) return;
    act(user, 'email', { email });
  }

  function toggleBan(user: ManagedUser) {
    if (!window.confirm(user.banned ? `Réactiver ${user.email} ?` : `Désactiver ${user.email} ? Le compte ne pourra plus se connecter.`)) return;
    act(user, user.banned ? 'unban' : 'ban');
  }

  function removeUser(user: ManagedUser) {
    if (!window.confirm(`Supprimer définitivement ${user.email} ? Cette action est irréversible.`)) return;
    act(user, 'delete');
  }

  function removeClient(user: ManagedUser) {
    if (!user.laboratoire_id) return;
    if (
      !window.confirm(
        `Supprimer le CLIENT ${user.full_name ?? user.email} ET son laboratoire (machines, réclamations, historique) ? Cette action est IRREVERSIBLE.`
      )
    ) {
      return;
    }
    act(user, 'delete', { delete_laboratoire: true });
  }

  async function approveUser(user: ManagedUser, laboId: string, role: Role) {
    setBusy(true);
    setError(null);
    const { error } = await edge('update-user', { user_id: user.id, action: 'approve', laboratoire_id: laboId || null, role });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setApproving(null);
    setNotice(`Compte ${user.email} validé et rattaché au laboratoire.`);
    refresh();
  }

  const pendingUsers = (users ?? []).filter((u) => u.statut === 'en_attente');

  if (loading && !users) return <Spinner label="Chargement des utilisateurs..." />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 page-title">Gestion des utilisateurs</h1>
          <p className="text-xs text-slate-500">Comptes des laboratoires clients</p>
        </div>
        <Link to="/dashboard" className="btn-outline px-3 py-1.5 text-xs">
          Tableau de bord
        </Link>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && (
        <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">
          {users?.length ?? 0} compte(s)
          {pendingUsers.length > 0 && (
            <span className="ml-2 badge bg-amber-100 text-amber-800">
              {pendingUsers.length} demande(s) en attente
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={loading} className="btn-outline px-3 py-1.5 text-xs">
            Actualiser
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary px-3 py-1.5 text-xs">
            + Nouveau compte
          </button>
        </div>
      </div>

      {pendingUsers.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-2 text-sm font-bold text-amber-800">
            Demandes d'inscription en attente ({pendingUsers.length})
          </h3>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {pendingUsers.map((u) => (
              <li key={u.id} className="card border-amber-200 bg-amber-50/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {u.full_name ?? u.email}
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                  <span className="badge shrink-0 bg-amber-100 text-amber-800">En attente</span>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">
                    {u.laboratoire_nom ?? 'Laboratoire sans nom'}
                  </p>
                  <p>
                    {[u.laboratoire_ville, u.laboratoire_adresse, u.laboratoire_telephone]
                      .filter(Boolean)
                      .join(' · ') || 'Aucune coordonnée'}
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setApproving(u);
                      setApproveLabo('');
                      setApproveRole('responsable');
                      setApproveCreateLabo(!u.laboratoire_nom);
                    }}
                    disabled={busy}
                    className="btn-primary px-2 py-1 text-xs"
                  >
                    Valider le compte
                  </button>
                  <button
                    onClick={() => removeUser(u)}
                    disabled={busy}
                    className="btn-outline border-red-200 text-red-600 px-2 py-1 text-xs"
                  >
                    Refuser (supprimer)
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {(users ?? []).map((u) => (
          <li key={u.id} className="card">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{u.email}</p>
                <p className="truncate text-xs text-slate-500">
                  {u.full_name ?? '—'}
                  {u.banned && <span className="ml-2 badge bg-red-100 text-red-700">Désactivé</span>}
                </p>
              </div>
              <span className={`badge shrink-0 ${ROLE_STYLES[u.role]}`}>
                {ROLE_LABELS[u.role]}
              </span>
              {u.is_super_admin && (
                <span className="badge shrink-0 bg-amber-100 text-amber-800">Super Admin</span>
              )}
              {u.role === 'admin' && !u.is_super_admin && (
                <span className="badge shrink-0 bg-slate-100 text-slate-600">Admin standard</span>
              )}
            </div>
            <div className="mt-3 space-y-2">
              <select
                value={u.role}
                disabled={busy || (isAdminAccount(u) && !callerIsSuper)}
                onChange={(e) => changeRole(u, e.target.value as Role)}
                className="input w-full text-sm"
              >
                <option value="technicien">Technicien</option>
                <option value="responsable">Responsable (biologiste)</option>
                {callerIsSuper && <option value="admin">Administrateur (BioPlus)</option>}
              </select>
              {u.role === 'responsable' ? (
                <select
                  value={u.laboratoire_id ?? ''}
                  disabled={busy}
                  onChange={(e) => changeLabo(u, e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="">— Aucun laboratoire —</option>
                  {laboratoires.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="input w-full text-sm text-slate-500">
                  BioPlus · Service Technique (sans laboratoire)
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => changeEmail(u)}
                  disabled={busy || (isAdminAccount(u) && !callerIsSuper)}
                  className="btn-outline px-2 py-1 text-xs"
                >
                  Changer l'email
                </button>
                <button
                  onClick={() => resetPassword(u)}
                  disabled={busy || (isAdminAccount(u) && !callerIsSuper)}
                  className="btn-outline px-2 py-1 text-xs"
                >
                  Changer le mot de passe
                </button>
                <button
                  onClick={() => toggleBan(u)}
                  disabled={busy || (isAdminAccount(u) && !callerIsSuper)}
                  className="btn-outline px-2 py-1 text-xs"
                >
                  {u.banned ? 'Réactiver' : 'Désactiver'}
                </button>
                <button
                  onClick={() => removeUser(u)}
                  disabled={busy || (isAdminAccount(u) && !callerIsSuper)}
                  className="btn-outline border-red-200 text-red-600 px-2 py-1 text-xs"
                >
                  Supprimer
                </button>
                {u.laboratoire_id && !isAdminAccount(u) && (
                  <button
                    onClick={() => removeClient(u)}
                    disabled={busy}
                    className="btn-outline border-red-300 bg-red-50 text-red-700 px-2 py-1 text-xs"
                  >
                    Supprimer client + laboratoire
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {approving && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="card w-full max-w-md space-y-3 lg:max-w-xl">
            <h3 className="text-base font-bold text-slate-900">
              Valider {approving.full_name ?? approving.email}
            </h3>
            {approving.laboratoire_nom && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                Laboratoire demandé : <strong>{approving.laboratoire_nom}</strong>
                {approving.laboratoire_ville ? ` (${approving.laboratoire_ville})` : ''}
              </p>
            )}
            <select
              value={approveRole}
              onChange={(e) => setApproveRole(e.target.value as Role)}
              className="input w-full"
            >
              <option value="responsable">Responsable (biologiste — client)</option>
              <option value="technicien">Technicien (BioPlus)</option>
              {callerIsSuper && <option value="admin">Administrateur (BioPlus)</option>}
            </select>
            {approveRole === 'responsable' && (
              <>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={approveCreateLabo}
                    onChange={(e) => setApproveCreateLabo(e.target.checked)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  Créer un nouveau laboratoire avec les informations fournies
                </label>
                {approveCreateLabo ? (
                  <p className="text-xs text-slate-500">
                    Le laboratoire « {approving.laboratoire_nom ?? 'à nommer'} » sera créé et ce
                    compte y sera rattaché.
                  </p>
                ) : (
                  <select
                    value={approveLabo}
                    onChange={(e) => setApproveLabo(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">— Choisir un laboratoire existant —</option>
                    {laboratoires.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nom}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            {approveRole !== 'responsable' && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
                Technicien et administrateur = personnel BioPlus : pas de laboratoire client.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => approveUser(approving, approveRole === 'responsable' ? approveLabo : '', approveRole)}
                disabled={busy || (approveRole === 'responsable' && !approveCreateLabo && !approveLabo)}
                className="btn-primary flex-1"
              >
                {busy ? 'Validation...' : 'Valider'}
              </button>
              <button onClick={() => setApproving(null)} className="btn-outline flex-1">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <form onSubmit={handleCreate} className="card w-full max-w-md space-y-3 lg:max-w-xl">
            <h3 className="text-base font-bold text-slate-900">Nouveau compte</h3>
            <input
              type="email"
              required
              placeholder="Email du compte"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input w-full"
            />
            <input
              type="text"
              placeholder="Nom complet (ex : Dr Sonia Ben Ali)"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input w-full"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Mot de passe (6 caractères min)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input w-full"
            />
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value as Role,
                  laboratoire_id: e.target.value === 'responsable' ? form.laboratoire_id : ''
                })
              }
              className="input w-full"
            >
              <option value="technicien">Technicien (BioPlus)</option>
              <option value="responsable">Responsable (biologiste — client)</option>
              {callerIsSuper && <option value="admin">Administrateur (BioPlus)</option>}
            </select>
            {form.role === 'responsable' && (
              <select
                value={form.laboratoire_id}
                onChange={(e) => setForm({ ...form, laboratoire_id: e.target.value })}
                className="input w-full"
              >
                <option value="">— Choisir le laboratoire du client —</option>
                {laboratoires.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nom}
                  </option>
                ))}
              </select>
            )}
            {form.role !== 'responsable' && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
                Technicien et administrateur = personnel BioPlus : pas de laboratoire client.
              </p>
            )}
            {!callerIsSuper && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
                La création de comptes admin est réservée au super administrateur.
              </p>
            )}
            {callerIsSuper && form.role === 'admin' && (
              <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">
                Le compte créé sera un <strong>admin standard</strong> (pas un super admin) :
                vous seul pourrez le modifier ou le supprimer.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || (form.role === 'responsable' && !form.laboratoire_id)}
                className="btn-primary flex-1"
              >
                {busy ? 'Création...' : 'Créer le compte'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="btn-outline flex-1"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}