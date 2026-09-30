import type { Role } from './supabaseClient';
import type { IconName } from '../components/Icon';

export interface NavItem {
  to: string;
  label: string;
  /** Libelle court pour la barre basse mobile, ou vide si l'item n'y va jamais. */
  short: string;
  icon: IconName;
  roles: readonly Role[];
  /** Candidat a la barre basse mobile (max 4 affiches). */
  primary: boolean;
}

const ALL: readonly Role[] = ['technicien', 'responsable', 'admin'];
const MANAGERS: readonly Role[] = ['responsable', 'admin'];
const ADMINS: readonly Role[] = ['admin'];

/**
 * Source unique de verite pour la navigation. Le Layout, la barre basse mobile et
 * la feuille "Plus" lisent tous cette liste : ajouter une page ici et une seule
 * ligne dans App.tsx, et elle apparait partout. Avant, chaque page dupliquait son
 * header et son bouton deconnexion.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Tableau de bord', short: 'Accueil', icon: 'grid', roles: ALL, primary: true },
  { to: '/ticket/new', label: 'Nouveau ticket', short: 'Ticket', icon: 'plus', roles: ALL, primary: true },
  { to: '/automates', label: 'Automates', short: 'Automates', icon: 'cpu', roles: MANAGERS, primary: true },
  { to: '/alarms', label: 'Alarmes', short: 'Alarmes', icon: 'bell', roles: ADMINS, primary: true },
  { to: '/clients', label: 'Clients', short: 'Clients', icon: 'building', roles: ADMINS, primary: false },
  { to: '/reclamations', label: 'Reclamations', short: 'Reclamations', icon: 'chat', roles: ADMINS, primary: false },
  { to: '/analytics', label: 'Analytics', short: 'Stats', icon: 'chart', roles: ADMINS, primary: false },
  { to: '/users', label: 'Utilisateurs', short: 'Utilisateurs', icon: 'users', roles: ADMINS, primary: false },
  { to: '/galaxy', label: 'GalacticOS', short: 'Galaxy', icon: 'sparkles', roles: ALL, primary: false }
];

export function navForRole(role: Role | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
