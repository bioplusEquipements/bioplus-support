import { useEffect, useMemo, useState } from 'react';
import HeroVideo from '../components/HeroVideo';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { edge } from '../lib/edge';
import { useAuth } from '../contexts/AuthContext';
import { useGalacticos, setUiMode } from '../hooks/useGalacticos';
import Logo from '../components/Logo';
import { supabase, type Laboratoire, type TicketWithAutomate, type Statut, type Priorite } from '../lib/supabaseClient';
import { STATUT_STYLES, PRIORITE_STYLES } from '../lib/styles';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import CommandCenter from './CommandCenter';

export default function Dashboard() {
  const isGalacticos = useGalacticos();
  return (
    <>
      <HeroVideo />
      {isGalacticos ? <CommandCenter /> : <ClassicDashboard />}
    </>
  );
}

function ClassicDashboard() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  const [laboratoire, setLaboratoire] = useState<Laboratoire | null>(null);
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [assigned, setAssigned] = useState<TicketWithAutomate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRegQr, setShowRegQr] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [alarmPendingCount, setAlarmPendingCount] = useState<number | null>(null);
  const [live, setLive] = useState(0);
  const [modeError, setModeError] = useState<string | null>(null);
  const [assignedPage, setAssignedPage] = useState(1);
  const [laboPage, setLaboPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!profile?.laboratoire_id) return;
    const channel = supabase
      .channel('dashboard-live')
      .on(
        'postgres_changes',
        profile.role === 'admin'
          ? { event: '*', schema: 'public', table: 'tickets' }
          : { event: '*', schema: 'public', table: 'tickets', filter: `laboratoire_id=eq.${profile.laboratoire_id}` },
        () => setLive((n) => n + 1)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.laboratoire_id, profile?.role]);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    supabase
      .functions
      .invoke<{ users: Array<{ statut: string }> }>('list-users')
      .then(({ data }) => {
        setPendingCount(
          data?.users.filter((u) => u.statut === 'en_attente').length ?? 0
        );
      });
    edge<{ recipients: Array<{ statut: string }> }>('alarm-recipients', { action: 'list' }).then(
      ({ data }) => {
        setAlarmPendingCount(
          data?.recipients.filter((r) => r.statut === 'en_attente').length ?? 0
        );
      }
    );
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('technicien_id', null)
      .neq('statut', 'resolu')
      .then(({ count }) => setOpenCount(count ?? 0));
  }, [profile?.role, live]);

  useEffect(() => {
    if (!profile?.laboratoire_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from('laboratoires')
        .select('*')
        .eq('id', profile.laboratoire_id)
        .maybeSingle(),
      supabase
        .from('tickets')
        .select('*, automates(id, nom, modele)')
        .order('created_at', { ascending: false })
        .limit(100)
    ]).then(([labo, tick]) => {
      setLaboratoire(labo.data as Laboratoire | null);
      if (tick.error) setError(tick.error.message);
      else setTickets(tick.data as TicketWithAutomate[]);
      setLoading(false);
    });
  }, [profile?.laboratoire_id, live]);

  useEffect(() => {
    if (profile?.role !== 'technicien' || !user) {
      setAssigned([]);
      return;
    }
    supabase
      .from('tickets')
      .select('*, automates(id, nom, modele), laboratoire:laboratoires(id, nom)')
      .eq('technicien_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setAssigned(data as TicketWithAutomate[]);
      });
  }, [profile?.role, user?.id, live]);

  async function setStatut(t: TicketWithAutomate, statut: Statut) {
    setError(null);
    const { error: err } = await supabase
      .from('tickets')
      .update({ statut, updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (err) setError(err.message);
    else {
      setAssigned((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, statut } : x))
      );
    }
  }

  const stats = useMemo(() => {
    const byStatut: Record<Statut, number> = { ouvert: 0, en_cours: 0, resolu: 0 };
    const byPriorite: Record<Priorite, number> = { normal: 0, important: 0, critique: 0 };
    for (const t of tickets) {
      byStatut[t.statut] += 1;
      byPriorite[t.priorite] += 1;
    }
    return { byStatut, byPriorite, total: tickets.length };
  }, [tickets]);

  const assignedStats = useMemo(() => {
    const total = assigned.length;
    const start = (assignedPage - 1) * PAGE_SIZE;
    return { total, pageItems: assigned.slice(start, start + PAGE_SIZE) };
  }, [assigned, assignedPage]);

  const laboStats = useMemo(() => {
    const total = tickets.length;
    const start = (laboPage - 1) * PAGE_SIZE;
    return { total, pageItems: tickets.slice(start, start + PAGE_SIZE) };
  }, [tickets, laboPage]);

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  async function handleGoGalacticos() {
    setModeError(null);
    try {
      await setUiMode('galacticos');
      window.location.reload();
    } catch (e) {
      setModeError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }

  function renderHeader() {
    return (
      <header className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 to-emerald-700 p-4 text-white shadow-lg shadow-teal-900/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={44} className="shrink-0" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">BioPlus Support</h1>
              <p className="truncate text-xs font-medium text-teal-100">
                {profile?.role === 'responsable'
                  ? `${laboratoire?.nom ?? 'Profil non rattaché'} · Client`
                  : 'BioPlus · Service Technique'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleGoGalacticos}
              title="Basculer vers l'interface GalacticOS (Command Center, Galaxy View…)"
              className="shrink-0 rounded-lg border border-white/40 bg-transparent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
            >
              ✦ Mode GalacticOS
            </button>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
    );
  }

  if (loading) return <Spinner label="Chargement du tableau de bord..." />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
      {renderHeader()}

      {modeError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{modeError}</p>
      )}

      {profile?.statut === 'en_attente' && (
        <div className="card mb-4 border-amber-200 bg-amber-50">
          <h2 className="text-base font-bold text-amber-900">Compte en attente de validation</h2>
          <p className="mt-1 text-sm text-amber-800">
            Votre demande d'inscription a bien été reçue. L'administration BioPlus doit
            valider votre laboratoire avant l'activation de votre accès.
          </p>
          <p className="mt-2 text-xs text-amber-700">
            Contact : support@bioplus.tn · +216 71 000 000
          </p>
        </div>
      )}

      {profile?.role === 'admin' && (
        <div className="space-y-4">
          <div className="card border-dashed">
            <h2 className="text-base font-bold text-slate-900">
              {profile?.is_super_admin
                ? 'Super-administration BioPlus'
                : 'Administration BioPlus'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Gestion multi-laboratoires, comptes utilisateurs et parc d'automates.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                        <Link to="/reclamations" className="card block transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">
                Réclamations des laboratoires
                {openCount ? (
                  <span className="ml-2 badge bg-red-100 text-red-700">
                    {openCount} à dispatcher
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-slate-500">
                Recevoir les réclamations des biologistes et les assigner au technicien adéquat.
              </p>
            </Link>
            <Link to="/clients" className="card block transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">Portefeuille clients</p>
              <p className="text-xs text-slate-500">
                Tous les clients inscrits ou ajoutés : comptes, automates et historique complet des
                réclamations.
              </p>
            </Link>
            <Link to="/analytics" className="card block transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">Analyse & efficacité</p>
              <p className="text-xs text-slate-500">
                KPIs, temps de résolution, efficacité des techniciens, machines à problèmes, export
                CSV.
              </p>
            </Link>
            <Link to="/users" className="card block transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">
                Comptes utilisateurs
                {pendingCount ? (
                  <span className="ml-2 badge bg-amber-100 text-amber-800">
                    {pendingCount} demande(s) en attente
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-slate-500">
                Valider les inscriptions des laboratoires clients, gérer les rôles et les accès.
              </p>
            </Link>
            <Link to="/automates" className="card block transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">Parc d'automates</p>
              <p className="text-xs text-slate-500">
                Ajouter, modifier ou retirer les machines de chaque laboratoire.
              </p>
            </Link>
            <Link to="/alarms" className="card block transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">
                Alertes par email
                {alarmPendingCount ? (
                  <span className="ml-2 badge bg-amber-100 text-amber-800">
                    {alarmPendingCount} à valider
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-slate-500">
                Destinataires des alarmes critiques par email — validation par m.dababi.
              </p>
            </Link>
            <button onClick={() => setShowRegQr(true)} className="card block w-full text-left transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">QR d'inscription client</p>
              <p className="text-xs text-slate-500">
                À imprimer : le client le scanne pour créer son compte (validation requise).
              </p>
            </button>
          </div>
        </div>
      )}

      {profile?.role === 'technicien' && (
        <>
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Mes réclamations ({assigned.length})
              </h2>
              <span className="text-xs text-slate-400">
                Assignées par l'administration
              </span>
            </div>

            {assigned.length === 0 ? (
              <div className="card bg-slate-100 text-center">
                <p className="text-sm text-slate-500">
                  Aucune réclamation assignée pour le moment.
                </p>
              </div>
            ) : (
              <>
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {assignedStats.pageItems.map((t) => (
                  <li key={t.id}>
                    <Link to={`/ticket/${t.id}`} className="card block transition hover:border-teal-600">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {t.automates?.nom ?? 'Automate supprimé'}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {t.laboratoire?.nom ?? 'Laboratoire inconnu'} ·{' '}
                            {t.message_erreur ?? t.description ?? 'Sans message'}
                          </p>
                        </div>
                        <span className={`badge shrink-0 ${PRIORITE_STYLES[t.priorite]}`}>
                          {t.priorite}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className={`badge ${STATUT_STYLES[t.statut]}`}>{t.statut}</span>
                        <div className="flex gap-2">
                          {t.statut === 'ouvert' && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setStatut(t, 'en_cours'); }}
                              className="btn-outline px-2 py-1 text-xs"
                            >
                              Prendre en cours
                            </button>
                          )}
                          {t.statut !== 'resolu' && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setStatut(t, 'resolu'); }}
                              className="btn-primary px-2 py-1 text-xs"
                            >
                              Résoudre
                            </button>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                page={assignedPage}
                totalItems={assignedStats.total}
                pageSize={PAGE_SIZE}
                onPageChange={setAssignedPage}
              />
              </>
            )}
          </section>
        </>
      )}

      {profile?.role === 'responsable' && !profile?.laboratoire_id && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">
            Votre profil n'est pas encore rattaché à un laboratoire.
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Contactez l'administration BioPlus pour activer votre compte.
          </p>
        </div>
      )}

      {profile?.role === 'responsable' && (
        <>
          <section className="mb-4 grid grid-cols-3 gap-2">
            <div className="card text-center">
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">Tickets</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-amber-600">
                {stats.byStatut.ouvert + stats.byStatut.en_cours}
              </p>
              <p className="text-xs text-slate-500">En attente</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-red-600">{stats.byPriorite.critique}</p>
              <p className="text-xs text-slate-500">Critiques</p>
            </div>
          </section>
          <Link to="/automates" className="card mb-4 block transition hover:border-teal-600">
            <p className="text-sm font-semibold text-slate-900">Parc d'automates</p>
            <p className="text-xs text-slate-500">
              Ajouter des machines, imprimer leurs QR codes, gérer leur statut.
            </p>
          </Link>

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Tickets de mon laboratoire</h2>
            <Link to="/ticket/new" className="btn-primary px-3 py-1.5 text-xs">
              + Nouveau
            </Link>
          </div>

          {tickets.length === 0 ? (
            <div className="card bg-slate-100 text-center">
              <p className="text-sm text-slate-500">Aucun ticket pour le moment.</p>
            </div>
          ) : (
            <>
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {laboStats.pageItems.map((t) => (
                <li key={t.id}>
                  <Link to={`/ticket/${t.id}`} className="card block transition hover:border-teal-600">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {t.automates?.nom ?? 'Automate supprimé'}
                      </p>
                      <span className={`badge ${PRIORITE_STYLES[t.priorite]}`}>{t.priorite}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {t.message_erreur ?? t.description ?? 'Sans message'}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`badge ${STATUT_STYLES[t.statut]}`}>{t.statut}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(t.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={laboPage}
              totalItems={laboStats.total}
              pageSize={PAGE_SIZE}
              onPageChange={setLaboPage}
            />
            </>
          )}
        </>
      )}

      {profile && user && (
        <p className="mt-6 text-center text-xs text-slate-400">
          Connecté en tant que {user.email} · {window.location.hostname}
        </p>
      )}

      {showRegQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="qr-print-area card w-full max-w-xs text-center">
            <h3 className="text-base font-bold text-slate-900">QR d'inscription client</h3>
            <p className="mb-3 text-xs text-slate-500">
              Le client le scanne : il arrive sur la page d'inscription, puis vous validez son
              compte.
            </p>
            <div className="mx-auto w-fit rounded-lg bg-white p-3">
              <QRCodeSVG
                value={`${window.location.origin}${window.location.pathname.startsWith('/bioplus-support') ? '/bioplus-support' : ''}/register`}
                size={200}
                level="M"
              />
            </div>
            <p className="mt-3 break-all text-[10px] text-slate-400">
              {`${window.location.origin}${window.location.pathname.startsWith('/bioplus-support') ? '/bioplus-support' : ''}/register`}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => window.print()} className="btn-primary flex-1">
                Imprimer
              </button>
              <button onClick={() => setShowRegQr(false)} className="btn-outline flex-1">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}