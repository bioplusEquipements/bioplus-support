import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://bioplusequipements.github.io',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token) return json({ error: 'Authentification requise.' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !caller) return json({ error: 'Session invalide.' }, 401);

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  if (!brevoKey) {
    return json({ ok: false, skipped: true, reason: 'BREVO_API_KEY non configurée' });
  }

  const { ticket_id, type, technicien_id } = await req.json().catch(() => ({}));
  if (!ticket_id || !['critique', 'assignation'].includes(type)) {
    return json({ error: 'Paramètres invalides.' }, 400);
  }

  const { data: ticket } = await admin
    .from('tickets')
    .select('*, laboratoire:laboratoires(nom), automates(nom, modele, numero_serie), technicien:profiles!tickets_technicien_id_fkey(full_name)')
    .eq('id', ticket_id)
    .maybeSingle();
  if (!ticket) return json({ error: 'Réclamation introuvable.' }, 404);

  const labo = (ticket.laboratoire as { nom: string } | null)?.nom ?? 'Laboratoire inconnu';
  const machine = (ticket.automates as { nom: string; modele: string | null } | null)?.nom ?? 'Machine inconnue';
  const url = `${Deno.env.get('APP_URL') ?? 'https://bioplusequipements.github.io/bioplus-support'}/ticket/${ticket_id}`;

  let to: string | null = null;
  let subject = '';
  let body = '';

  if (type === 'critique') {
    const emails: string[] = [];
    const { data: supers } = await admin
      .from('profiles')
      .select('user_id')
      .eq('is_super_admin', true);
    for (const s of supers ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(s.user_id);
      if (u?.user?.email && !emails.includes(u.user.email)) emails.push(u.user.email);
    }
    const { data: recips } = await admin
      .from('alarm_recipients')
      .select('email')
      .eq('statut', 'valide');
    for (const r of recips ?? []) {
      if (r.email && !emails.includes(r.email)) emails.push(r.email);
    }
    if (emails.length === 0) return json({ ok: false, skipped: true, reason: 'aucun destinataire' });
    to = emails.join(',');
    subject = `[CRITIQUE] Réclamation ${labo} — ${machine}`;
    body = `Une réclamation CRITIQUE vient d'être créée.\n\nLaboratoire : ${labo}\nMachine : ${machine}\nPriorité : critique\nDescription : ${ticket.description ?? ticket.message_erreur ?? '—'}\n\nOuvrir : ${url}`;
  } else {
    if (!technicien_id) return json({ error: 'technicien_id requis.' }, 400);
    const { data: tech } = await admin.auth.admin.getUserById(technicien_id);
    if (!tech?.user?.email) return json({ ok: false, skipped: true, reason: 'technicien sans email' });
    to = tech.user.email;
    subject = `Nouvelle réclamation assignée — ${labo}`;
    body = `Une réclamation vous a été assignée.\n\nLaboratoire : ${labo}\nMachine : ${machine}\nPriorité : ${ticket.priorite}\nDescription : ${ticket.description ?? ticket.message_erreur ?? '—'}\n\nOuvrir : ${url}`;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { email: Deno.env.get('BREVO_SENDER_EMAIL') ?? 'noreply@bioplus.tn', name: 'BioPlus Support' },
      to: to.split(',').map((email) => ({ email: email.trim() })),
      subject,
      textContent: body
    })
  });
  if (!res.ok) {
    const detail = await res.text();
    return json({ ok: false, error: `Brevo : HTTP ${res.status} ${detail}` }, 502);
  }
  return json({ ok: true, to });
});
