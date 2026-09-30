/**
 * Traduit les erreurs techniques de supabase-js en messages comprensibles.
 *
 * Contexte : en septembre 2026 le projet Supabase avait ete mis en pause
 * automatiquement par Supabase. Le DNS ne resolvait plus, et l'app affichait
 * litteralement "Failed to fetch" sur la page de connexion. Ni l'utilisateur ni
 * l'administrateur n'avaient de piste. D'ou ce module.
 */

const NETWORK_HINT =
  "Le service est momentanément injoignable. Vérifie ta connexion internet et réessaie dans quelques minutes.";

const PAUSED_HINT =
  "Le service est momentanément indisponible côté serveur. Réessaie dans quelques minutes.";

export function isNetworkFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    msg === 'Failed to fetch' ||
    msg === 'NetworkError when attempting to fetch resource.' ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
  );
}

/** Message affichable a l'utilisateur, pour n'importe quelle erreur supabase. */
export function friendlyAuthError(err: unknown, fallback = 'Connexion impossible.'): string {
  if (err === null || err === undefined) return fallback;

  // Erreur renvoyee par le client HTTP de supabase (status + corps).
  const status = (err as { status?: number }).status;
  const raw = err instanceof Error ? err.message : String(err);
  const msg = (raw || '').trim();

  if (isNetworkFailure(err)) return NETWORK_HINT;

  // Projet en pause : Supabase repond 503, l'hote ne resout meme plus en DNS.
  if (status === 503 || /paused|project is paused/i.test(msg)) return PAUSED_HINT;

  if (status === 429 || /rate limit|too many requests/i.test(msg)) {
    return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.';
  }

  if (/invalid login credentials/i.test(msg)) {
    return 'Email ou mot de passe incorrect.';
  }

  if (/email not confirmed/i.test(msg)) {
    return 'Compte non validé. Contacte le support pour activer ton accès.';
  }

  if (/user already registered/i.test(msg)) {
    return 'Un compte existe déjà avec cet email. Connecte-toi.';
  }

  if (/password should be at least/i.test(msg)) {
    return 'Le mot de passe est trop court (6 caractères minimum).';
  }

  if (/unable to validate email|invalid email/i.test(msg)) {
    return 'Adresse email invalide.';
  }

  // Erreur metier (RLS, contrainte) : le message technique est utile, on le garde.
  return msg || fallback;
}
