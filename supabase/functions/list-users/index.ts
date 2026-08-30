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

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', caller.id)
    .maybeSingle();
  if (callerProfile?.role !== 'admin') {
    return json({ error: "Accès réservé à l'administrateur BioPlus." }, 403);
  }

  const { data: users, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) return json({ error: usersErr.message }, 500);

  const { data: profiles } = await admin.from('profiles').select('*');

  const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const now = Date.now();

  const result = users.users.map((u) => {
    const p = profileByUser.get(u.id);
    return {
      id: u.id,
      email: u.email,
      role: p?.role ?? 'technicien',
      statut: p?.statut ?? 'valide',
      laboratoire_id: p?.laboratoire_id ?? null,
      full_name: p?.full_name ?? null,
      is_super_admin: p?.is_super_admin === true,
      laboratoire_nom: p?.laboratoire_nom ?? null,
      laboratoire_ville: p?.laboratoire_ville ?? null,
      laboratoire_adresse: p?.laboratoire_adresse ?? null,
      laboratoire_telephone: p?.laboratoire_telephone ?? null,
      created_at: u.created_at,
      banned: !!u.banned_until && new Date(u.banned_until).getTime() > now
    };
  });

  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return json({ users: result });
});