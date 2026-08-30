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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, is_super_admin')
    .eq('user_id', caller.id)
    .maybeSingle();
  if (callerProfile?.role !== 'admin') {
    return json({ error: "Accès réservé à l'administrateur BioPlus." }, 403);
  }
  const callerIsSuper = callerProfile?.is_super_admin === true;

  const { action, email, id } = await req.json().catch(() => ({}));

  if (action === 'list') {
    const { data: rows, error } = await admin
      .from('alarm_recipients')
      .select('id, email, statut, created_by, created_at, validated_at')
      .order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 500);
    const out = [];
    for (const r of rows ?? []) {
      let created_by_email = '';
      if (r.created_by) {
        const { data: u } = await admin.auth.admin.getUserById(r.created_by);
        created_by_email = u?.user?.email ?? '';
      }
      out.push({ ...r, created_by_email });
    }
    return json({ recipients: out });
  }

  if (action === 'add') {
    if (!email || !EMAIL_RE.test(email.trim())) {
      return json({ error: 'Adresse email invalide.' }, 400);
    }
    const clean = email.trim().toLowerCase();
    const { data: existing } = await admin
      .from('alarm_recipients')
      .select('id, statut')
      .eq('email', clean)
      .maybeSingle();
    if (existing) {
      return json(
        {
          error:
            existing.statut === 'valide'
              ? 'Cet email est déjà un destinataire validé.'
              : 'Cet email est déjà en attente de validation.'
        },
        409
      );
    }
    const { error: insErr } = await admin.from('alarm_recipients').insert({
      email: clean,
      statut: 'en_attente',
      created_by: caller.id
    });
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ ok: true });
  }

  if (['validate', 'refuser', 'delete'].includes(action)) {
    if (!callerIsSuper) {
      return json(
        { error: "Seul le super administrateur (m.dababi) peut valider ou retirer un destinataire d'alerte." },
        403
      );
    }
    if (!id) return json({ error: 'Identifiant manquant.' }, 400);
    if (action === 'validate') {
      const { error } = await admin
        .from('alarm_recipients')
        .update({ statut: 'valide', validated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await admin.from('alarm_recipients').delete().eq('id', id);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: 'Action invalide.' }, 400);
});