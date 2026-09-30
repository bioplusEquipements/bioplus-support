import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Icon from './Icon';

const FLAG = 'bioplus-backend-down';

/**
 * Bandeau d'indisponibilite du backend.
 *
 * Un projet Supabase en pause ne resout plus en DNS, et chaque page affichait
 * alors ses propres "Failed to fetch" sans explication. Ce bandeau sonde une
 * fois par session et explique la situation a l'utilisateur.
 *
 * La remediation reste automatique : le workflow "Keepalive Supabase" pinge
 * Postgres toutes les 6 h, donc la panne ne devrait pas se reproduire.
 */
export default function ServiceBanner({ dark }: { dark: boolean }) {
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const probe = useCallback(async () => {
    setChecking(true);
    try {
      const { error } = await supabase.from('app_settings').select('key').limit(1).maybeSingle();
      if (error) {
        setDown(true);
        setDismissed(false);
        try {
          sessionStorage.setItem(FLAG, '1');
        } catch {
          /* mode prive : la detection sera refaite au prochain montage */
        }
      } else {
        setDown(false);
        try {
          sessionStorage.removeItem(FLAG);
        } catch {
          /* ignore */
        }
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    // Une seule verification par session : inutile de re-sonder a chaque navigation.
    try {
      if (sessionStorage.getItem(FLAG) === '1') {
        setDown(true);
        return;
      }
    } catch {
      /* ignore */
    }
    void probe();
  }, [probe]);

  if (!down || dismissed) return null;

  const shell = dark
    ? 'border-amber-400/30 bg-amber-400/10'
    : 'border-amber-300 bg-amber-50';
  const title = dark ? 'text-amber-200' : 'text-amber-900';
  const body = dark ? 'text-amber-300/80' : 'text-amber-800';
  const ghost = dark
    ? 'border-amber-400/30 text-amber-200 transition hover:bg-amber-400/10'
    : 'border-amber-300 text-amber-800 transition hover:bg-amber-100';

  return (
    <div role="alert" className={`mb-4 flex flex-wrap items-start gap-3 rounded-card border p-3 ${shell}`}>
      <Icon name="bell" size={20} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${title}`}>Service momentanément indisponible</p>
        <p className={`mt-0.5 text-xs ${body}`}>
          Les données affichées peuvent être incomplètes et les enregistrements échoueront.
          L'équipe technique est prévenue automatiquement.
        </p>
      </div>
      <button onClick={() => void probe()} disabled={checking} className={`rounded-ctl border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${ghost}`}>
        {checking ? 'Verification...' : 'Reessayer'}
      </button>
      <button onClick={() => setDismissed(true)} className={`rounded-ctl border px-3 py-1.5 text-xs font-semibold ${ghost}`}>
        Fermer
      </button>
    </div>
  );
}
