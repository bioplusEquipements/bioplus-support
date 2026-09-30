import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { navForRole, type NavItem } from '../lib/navigation';
import { useGalacticos, setUiMode } from '../hooks/useGalacticos';
import Icon from './Icon';
import Logo from './Logo';
import ServiceBanner from './ServiceBanner';

/** Nombre d'entrees dans la barre basse avant de basculer le reste dans "Plus". */
const MOBILE_SLOTS = 4;

function NavRow({
  item,
  onNavigate,
  dark
}: {
  item: NavItem;
  onNavigate?: () => void;
  dark: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'group flex items-center gap-3 rounded-ctl px-3 py-2.5 text-sm font-medium transition',
          isActive
            ? dark
              ? 'bg-cyan-400/10 text-cyan-300'
              : 'bg-brand-soft text-brand-ink'
            : dark
              ? 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              : 'text-ink-soft hover:bg-surface-alt hover:text-ink'
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            name={item.icon}
            size={20}
            className={
              isActive
                ? dark
                  ? 'text-cyan-300'
                  : 'text-brand'
                : dark
                  ? 'text-slate-500 group-hover:text-slate-300'
                  : 'text-ink-mute group-hover:text-ink-soft'
            }
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function UserBlock({ signOut, dark }: { signOut: () => Promise<void>; dark: boolean }) {
  const { profile, user } = useAuth();
  const label = profile?.full_name?.trim() || user?.email || 'Compte';
  const roleLabel =
    profile?.role === 'admin' ? 'Administrateur' : profile?.role === 'responsable' ? 'Responsable' : 'Technicien';

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${dark ? 'text-slate-100' : 'text-ink'}`}>{label}</p>
        <p className={`truncate text-xs ${dark ? 'text-slate-500' : 'text-ink-mute'}`}>
          {roleLabel}
          {profile?.laboratoire_nom ? ` · ${profile.laboratoire_nom}` : ''}
        </p>
      </div>
      <button
        onClick={() => void signOut()}
        title="Se deconnecter"
        className={`shrink-0 rounded-ctl border p-2 transition ${
          dark
            ? 'border-white/10 text-slate-500 hover:bg-white/5 hover:text-slate-200'
            : 'border-line-strong text-ink-mute hover:bg-surface-alt hover:text-ink'
        }`}
      >
        <Icon name="logout" size={18} />
        <span className="sr-only">Se deconnecter</span>
      </button>
    </div>
  );
}

export default function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const isGalacticos = useGalacticos();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const items = navForRole(profile?.role);
  const slots = items.filter((item) => item.primary).slice(0, MOBILE_SLOTS);
  const overflow = items.filter((item) => !slots.includes(item));

  async function toggleMode() {
    setSwitchError(null);
    try {
      await setUiMode(isGalacticos ? 'classic' : 'galacticos');
      window.location.reload();
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }

  // En mode galacticos le contenu des pages est sombre : la coque suit, sinon on
  // aurait une sidebar claire au-dessus d'un espace de travail sombre.
  const dark = isGalacticos;
  const shellBg = dark ? 'bg-[#05080F]' : 'bg-canvas';
  const panelBg = dark ? 'bg-[#0B1220]' : 'bg-surface';
  const border = dark ? 'border-white/10' : 'border-line';
  const strongBorder = dark ? 'border-white/15' : 'border-line-strong';
  const title = dark ? 'text-slate-100' : 'text-ink';
  const muted = dark ? 'text-slate-500' : 'text-ink-mute';
  const soft = dark ? 'text-slate-400' : 'text-ink-soft';
  const accentText = dark ? 'text-cyan-300' : 'text-brand';
  const ghostBtn = dark
    ? 'border-white/15 text-slate-400 transition hover:bg-white/5 hover:text-slate-100'
    : 'border-line-strong text-ink-soft transition hover:bg-surface-alt hover:text-ink';

  return (
    <div className={`min-h-screen ${shellBg}`}>
      {/* ---------------------------------------------------------- sidebar PC */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r ${border} ${panelBg} lg:flex`}>
        <div className={`flex items-center gap-3 border-b ${border} px-5 py-4`}>
          <Logo size={36} />
          <div className="min-w-0">
            <p className={`truncate text-sm font-bold ${title}`}>BioPlus Support</p>
            <p className={`truncate text-xs ${muted}`}>Automates Horiba ABX</p>
          </div>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavRow key={item.to} item={item} dark={dark} />
          ))}
        </nav>

        <div className={`space-y-3 border-t ${border} p-3`}>
          {switchError ? (
            <p className="rounded-ctl bg-red-50 px-3 py-2 text-xs text-red-700">{switchError}</p>
          ) : null}
          <button
            onClick={() => void toggleMode()}
            className={`flex w-full items-center justify-center gap-2 rounded-ctl border px-3 py-2 text-xs font-semibold ${ghostBtn}`}
          >
            <Icon name="sparkles" size={16} />
            {isGalacticos ? 'Revenir au mode classique' : 'Passer en GalacticOS'}
          </button>
          <UserBlock signOut={signOut} dark={dark} />
        </div>
      </aside>

      {/* ------------------------------------------------- barre basse mobile */}
      <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header
          className={`sticky top-0 z-20 flex items-center gap-3 border-b ${border} px-4 py-3 backdrop-blur lg:hidden ${
            dark ? 'bg-[#05080F]/90' : 'bg-surface/90'
          }`}
        >
          <Logo size={32} />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-bold ${title}`}>BioPlus Support</p>
            <p className={`truncate text-xs ${muted}`}>
              {profile?.role === 'responsable'
                ? `${profile.laboratoire_nom ?? 'Profil non rattache'} · Vue client`
                : 'BioPlus · Service Technique'}
            </p>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Ouvrir le menu"
            className={`shrink-0 rounded-ctl border p-2 ${strongBorder} ${soft}`}
          >
            <Icon name="menu" size={20} />
          </button>
        </header>

        <main className="lg:pl-64">
          <div className="mx-auto w-full max-w-5xl px-4 py-5 lg:px-8 lg:py-8">
            <ServiceBanner dark={dark} />
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        aria-label="Navigation rapide"
        className={`fixed inset-x-0 bottom-0 z-30 border-t ${border} backdrop-blur lg:hidden ${
          dark ? 'bg-[#0B1220]/95' : 'bg-surface/95'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${slots.length + (overflow.length ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {slots.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex min-h-[3.75rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-semibold transition',
                    isActive ? accentText : muted
                  ].join(' ')
                }
              >
                <Icon name={item.icon} size={21} />
                <span className="truncate">{item.short}</span>
              </NavLink>
            </li>
          ))}

          {overflow.length ? (
            <li>
              <button
                onClick={() => setSheetOpen(true)}
                className={`flex min-h-[3.75rem] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-semibold transition ${
                  overflow.some((item) => item.to === location.pathname) ? accentText : muted
                }`}
              >
                <Icon name="menu" size={21} />
                <span>Plus</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {/* ----------------------------------------------------- feuille "Plus" */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            aria-label="Fermer le menu"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/60"
          />
          <div
            className={`absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-card border-t ${border} ${panelBg} pb-[env(safe-area-inset-bottom)] shadow-pop`}
          >
            <div className={`flex items-center justify-between border-b ${border} px-4 py-3`}>
              <p className={`text-sm font-bold ${title}`}>Menu</p>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Fermer"
                className={`rounded-ctl border p-2 ${strongBorder} ${soft}`}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="p-3">
              {items.map((item) => (
                <NavRow
                  key={item.to}
                  item={item}
                  dark={dark}
                  onNavigate={() => setSheetOpen(false)}
                />
              ))}
            </div>

            <div className={`border-t ${border} p-3`}>
              <button
                onClick={() => void toggleMode()}
                className={`mb-3 flex w-full items-center justify-center gap-2 rounded-ctl border px-3 py-2.5 text-xs font-semibold ${ghostBtn}`}
              >
                <Icon name="sparkles" size={16} />
                {isGalacticos ? 'Revenir au mode classique' : 'Passer en GalacticOS'}
              </button>
              <UserBlock signOut={signOut} dark={dark} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
