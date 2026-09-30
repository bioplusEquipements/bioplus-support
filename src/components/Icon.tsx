export type IconName =
  | 'grid'
  | 'plus'
  | 'cpu'
  | 'bell'
  | 'building'
  | 'chart'
  | 'users'
  | 'sparkles'
  | 'chat'
  | 'logout'
  | 'menu'
  | 'close'
  | 'scan';

/**
 * Tracés en trait de 1.6, grille 24x24. Inline pour ne pas introduire de
 * dependance d'icones : le projet n'en a aucune.
 */
const PATHS: Record<IconName, string> = {
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  plus: 'M12 5v14M5 12h14',
  cpu: 'M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M6 6h12v12H6z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  building:
    'M3 21h18M6 21V5l6-2v18M18 21V9l-6-2M9.5 9.5h.01M9.5 13h.01M9.5 16.5h.01M15 12h.01M15 15.5h.01',
  chart: 'M3 3v18h18M7 15l4-5 3 3 5-7',
  users:
    'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1.5a4 4 0 0 0-3-3.87M16 3.5a4 4 0 0 1 0 7.75',
  sparkles:
    'M12 3.5l1.7 4.3 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  chat: 'M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z',
  logout: 'M15 17l5-5-5-5M20 12H9M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M18 6 6 18M6 6l12 12',
  scan: 'M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h10'
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Le titre n'est utile que pour une icone seule ; sinon le parent fournit le libelle. */
  title?: string;
}

export default function Icon({ name, size = 20, className = '', title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
