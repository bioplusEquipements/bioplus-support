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

const ROLES = ['admin', 'responsable', 'technicien'];

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

  const { email, password, laboratoire_id, role, full_name } = await req.json();
  if (!email || !password) return json({ error: 'Email et mot de passe requis.' }, 400);
  if (password.length < 6) return json({ error: 'Mot de passe : 6 caractères minimum.' }, 400);
  if (!ROLES.includes(role)) return json({ error: 'Rôle invalide.' }, 400);

  if (role === 'admin' && callerProfile?.is_super_admin !== true) {
    return json(
      { error: 'Seul le super administrateur peut créer des comptes admin.' },
      403
    );
  }

  // Seul un responsable (client) est rattaché à un laboratoire :
  // technicien et admin sont du personnel BioPlus, jamais clients.
  const finalLabo = role === 'responsable' ? (laboratoire_id ?? null) : null;

  if (finalLabo) {
    const { data: labo } = await admin
      .from('laboratoires')
      .select('id')
      .eq('id', finalLabo)
      .maybeSingle();
    if (!labo) return json({ error: 'Laboratoire introuvable.' }, 400);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { laboratoire_id: finalLabo, role, full_name }
  });
  if (error) return json({ error: error.message }, 400);

  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      laboratoire_id: finalLabo,
      role,
      full_name: full_name ?? null
    })
    .eq('user_id', data.user!.id);
  if (profileErr) return json({ error: profileErr.message }, 500);

  return json({ ok: true, user: { id: data.user!.id, email: data.user!.email } });
});