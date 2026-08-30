-- ============================================================================
-- BioPlus Support — Schéma Supabase (PostgreSQL + RLS + Storage)
-- Exécuter dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

create table public.laboratoires (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  adresse    text,
  ville      text,
  telephone  text,
  -- false : entité interne BioPlus (service technique) — jamais dans le
  -- portefeuille clients et ne peut PAS créer de réclamations.
  est_client boolean not null default true,
  created_at timestamptz not null default now()
);

-- user_id = auth.uid() : ne JAMAIS utiliser auth.uid() comme identifiant de laboratoire.
create table public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  laboratoire_id uuid references public.laboratoires (id) on delete set null,
  role           text not null default 'technicien'
                 check (role in ('admin', 'responsable', 'technicien')),
  -- 'en_attente' : auto-inscription via QR, rien n'est visible tant que l'admin n'a pas validé
  statut         text not null default 'valide'
                 check (statut in ('en_attente', 'valide')),
  -- seul le super administrateur (m.dababi) gère les comptes admin
  is_super_admin boolean not null default false,
  full_name      text,
  -- informations du laboratoire fournies à l'inscription (utilisées à la validation)
  laboratoire_nom      text,
  laboratoire_ville    text,
  laboratoire_adresse  text,
  laboratoire_telephone text,
  -- préférences utilisateur (JSONB) : ex. {"ui_mode":"classic"|"galacticos"}
  preferences    jsonb not null default '{"ui_mode":"classic"}'::jsonb,
  created_at     timestamptz not null default now()
);

-- Paramètres globaux applicatifs (kill switch runtime) : ex. key='force_ui_mode'
--   value=null            -> aucun forçage (chaque utilisateur suit sa préférence)
--   value={"mode":"classic"}     -> TOUT le monde revient en mode classique
--   value={"mode":"galacticos"}  -> TOUT le monde passe en mode galacticos
create table public.app_settings (
  key        text primary key,
  value      jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

-- Destinataires des alertes critiques (notifications Brevo)
create table public.alarm_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email ~* '^.+@.+\..+$'),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'valide', 'refuse')),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  validated_at timestamptz
);

create table public.automates (
  id            uuid primary key default gen_random_uuid(),
  laboratoire_id uuid not null references public.laboratoires (id) on delete cascade,
  nom           text not null,
  modele        text,
  numero_serie  text,
  photo_url     text,
  statut        text not null default 'actif'
                check (statut in ('actif', 'maintenance', 'hors_service')),
  created_at    timestamptz not null default now()
);

create table public.tickets (
  id            uuid primary key default gen_random_uuid(),
  laboratoire_id uuid not null references public.laboratoires (id) on delete cascade,
  automate_id   uuid not null references public.automates (id) on delete restrict,
  numero_serie  text,
  message_erreur text,
  code_erreur   text,
  description   text,
  photo_path    text, -- chemin dans le bucket 'photos', ex : laboratoire_123/ticket_456.jpg
  priorite      text not null default 'normal'
                check (priorite in ('normal', 'important', 'critique')),
  statut        text not null default 'ouvert'
                check (statut in ('ouvert', 'en_cours', 'resolu')),
  -- technicien BioPlus désigné par l'admin pour traiter la réclamation (dispatch)
  technicien_id uuid references public.profiles (user_id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create index if not exists tickets_laboratoire_idx on public.tickets (laboratoire_id);
create index if not exists tickets_automate_idx   on public.tickets (automate_id);
create index if not exists tickets_technicien_idx on public.tickets (technicien_id);
create index if not exists automates_labo_idx     on public.automates (laboratoire_id);

-- ---------------------------------------------------------------------------
-- 2. FONCTIONS UTILITAIRES
-- ---------------------------------------------------------------------------

-- Vrai si l'utilisateur courant appartient au laboratoire lab_id
-- ET que son compte est validé (les comptes « en attente » ne voient rien).
create or replace function public.is_member_of(lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.laboratoire_id = lab_id
      and p.statut = 'valide'
  );
$$;

-- Cast sécurisé text -> uuid (évite une erreur si le dossier Storage est malformé).
create or replace function public.uuid_or_null(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception
  when others then
    return null;
end $$;

-- Rôle de l'utilisateur courant (null si profil absent).
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

-- Crée automatiquement le profil à l'inscription d'un utilisateur.
-- - Inscription via l'app (QR) : statut 'en_attente' + infos du laboratoire fournies
-- - Création par l'admin (Edge Function) : statut 'valide'
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id, role, statut, full_name,
    laboratoire_nom, laboratoire_ville, laboratoire_adresse, laboratoire_telephone
  )
  values (
    new.id,
    'technicien',
    coalesce(new.raw_user_meta_data->>'statut', 'valide'),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'laboratoire_nom', ''),
    nullif(new.raw_user_meta_data->>'laboratoire_ville', ''),
    nullif(new.raw_user_meta_data->>'laboratoire_adresse', ''),
    nullif(new.raw_user_meta_data->>'laboratoire_telephone', '')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.laboratoires enable row level security;
alter table public.profiles      enable row level security;
alter table public.automates     enable row level security;
alter table public.tickets       enable row level security;
alter table public.app_settings  enable row level security;

-- app_settings : lecture seule pour tout utilisateur authentifié
-- (l'écriture se fait via SQL par l'administrateur — pas d'API exposée)
create policy "app_settings_select"
  on public.app_settings for select
  to authenticated
  using (true);

alter table public.alarm_recipients enable row level security;

create policy "alarm_recipients_select_admin"
  on public.alarm_recipients for select
  to authenticated
  using (public."current_role"() = 'admin');

create policy "alarm_recipients_insert_admin"
  on public.alarm_recipients for insert
  to authenticated
  with check (public."current_role"() = 'admin');

create policy "alarm_recipients_update_admin"
  on public.alarm_recipients for update
  to authenticated
  using (public."current_role"() = 'admin')
  with check (public."current_role"() = 'admin');

create policy "alarm_recipients_delete_admin"
  on public.alarm_recipients for delete
  to authenticated
  using (public."current_role"() = 'admin');

-- laboratoires : lecture pour tout utilisateur authentifié
create policy "laboratoires_select_authenticated"
  on public.laboratoires for select
  to authenticated
  using (true);

-- profiles : chacun ne voit/modifie que son propre profil
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Un utilisateur ne peut modifier que son propre nom et ses préférences
-- d'interface : le rôle, le statut et le laboratoire ne sont modifiables que
-- par l'admin (impossible de s'auto-valider ou de se promouvoir).
revoke update on public.profiles from authenticated;
grant update (full_name, preferences) on public.profiles to authenticated;

-- profiles : l'administrateur BioPlus lit et modifie tous les profils
-- (création de comptes, changements de rôle / de laboratoire)
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public."current_role"() = 'admin');

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public."current_role"() = 'admin')
  with check (true);

-- automates : lecture pour les membres du laboratoire + admin + technicien (doivent voir les automates pour les détails des tickets)
create policy "automates_select_member"
  on public.automates for select
  to authenticated
  using (
    public.is_member_of(laboratoire_id)
    or public."current_role"() in ('admin', 'technicien')
  );

-- automates : ajout / modification par tout membre du laboratoire (biologiste, technicien)
-- ou par l'admin (qui choisit le laboratoire propriétaire dans le formulaire)
create policy "automates_insert_manager"
  on public.automates for insert
  to authenticated
  with check (
    public.is_member_of(laboratoire_id) or public."current_role"() = 'admin'
  );

create policy "automates_update_manager"
  on public.automates for update
  to authenticated
  using (
    public.is_member_of(laboratoire_id) or public."current_role"() = 'admin'
  )
  with check (
    public.is_member_of(laboratoire_id) or public."current_role"() = 'admin'
  );

-- automates : suppression par responsable (seulement son labo) ou admin (tous labos)
create policy "automates_delete_manager"
  on public.automates for delete
  to authenticated
  using (
    (public.is_member_of(laboratoire_id) and public."current_role"() = 'responsable')
    or public."current_role"() = 'admin'
  );

-- tickets : lecture pour les membres du laboratoire, TOUS les techniciens BioPlus
-- (ils doivent voir les détails des pannes avant d'intervenir) et l'admin
create policy "tickets_select_member"
  on public.tickets for select
  to authenticated
  using (
    public.is_member_of(laboratoire_id)
    or public."current_role"() in ('admin', 'technicien')
    or technicien_id = auth.uid()
  );

create policy "tickets_insert_member"
  on public.tickets for insert
  to authenticated
  with check (
    (public.is_member_of(laboratoire_id) or public."current_role"() = 'admin')
    and exists (
      select 1
      from public.automates a
      where a.id = automate_id
        and a.laboratoire_id = laboratoire_id
    )
    -- le service technique BioPlus (est_client = false) ne peut pas réclamer
    and exists (
      select 1 from public.laboratoires l
      where l.id = laboratoire_id and l.est_client
    )
  );

-- tickets : suppression par admin uniquement
create policy "tickets_delete_admin"
  on public.tickets for delete
  to authenticated
  using (public."current_role"() = 'admin');

-- tickets : mise à jour par le membre du laboratoire, l'admin (assignation)
-- et le technicien assigné (suivi du statut).
create policy "tickets_update_member"
  on public.tickets for update
  to authenticated
  using (
    public.is_member_of(laboratoire_id)
    or public."current_role"() = 'admin'
    or technicien_id = auth.uid()
  )
  with check (
    public.is_member_of(laboratoire_id)
    or public."current_role"() = 'admin'
    or technicien_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3b. JOURNAL DES INTERVENTIONS (commentaires chronologiques sur chaque réclamation)
-- ---------------------------------------------------------------------------

create table public.interventions (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  message    text not null check (length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.interventions enable row level security;
create index if not exists interventions_ticket_idx on public.interventions (ticket_id);

-- Accès : mêmes droits que le ticket (membre du laboratoire, TOUS les techniciens BioPlus, admin).
create policy "interventions_select"
  on public.interventions for select
  to authenticated
  using (exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (
        public.is_member_of(t.laboratoire_id)
        or public."current_role"() in ('admin', 'technicien')
        or t.technicien_id = auth.uid()
      )
  ));

create policy "interventions_insert"
  on public.interventions for insert
  to authenticated
  with check (exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (
        public.is_member_of(t.laboratoire_id)
        or public."current_role"() = 'admin'
        or t.technicien_id = auth.uid()
      )
  ));

-- L'auteur de l'intervention est TOUJOURS l'utilisateur connecté (jamais falsifiable).
create or replace function public.handle_intervention_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end $$;

drop trigger if exists trg_intervention_user on public.interventions;
create trigger trg_intervention_user before insert on public.interventions
for each row execute function public.handle_intervention_user();

-- ---------------------------------------------------------------------------
-- 4. STOCKAGE DES PHOTOS (jamais de base64 en base)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Un utilisateur ne peut manipuler que les fichiers du dossier de son laboratoire.
-- Le premier segment du chemin (folder) est le laboratoire_id.
-- Les techniciens et admins BioPlus voient toutes les photos (support).
create policy "photos_insert_own_labo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (
      public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
      or public."current_role"() in ('admin','technicien')
    )
  );

create policy "photos_select_own_labo"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
      or public."current_role"() in ('admin','technicien')
    )
  );

create policy "photos_update_own_labo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
      or public."current_role"() in ('admin','technicien')
    )
  )
  with check (
    bucket_id = 'photos'
    and (
      public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
      or public."current_role"() in ('admin','technicien')
    )
  );

create policy "photos_delete_own_labo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
      or public."current_role"() in ('admin','technicien')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machine-photos', 'machine-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "machine_photos_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'machine-photos');

create policy "machine_photos_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'machine-photos' and public."current_role"() = 'admin');

create policy "machine_photos_update_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'machine-photos' and public."current_role"() = 'admin')
  with check (bucket_id = 'machine-photos' and public."current_role"() = 'admin');

create policy "machine_photos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'machine-photos' and public."current_role"() = 'admin');

-- ---------------------------------------------------------------------------
-- 4c. TRIGGER : empêcher les responsables de modifier technicien_id et statut
-- ---------------------------------------------------------------------------

create or replace function public.prevent_responsable_ticket_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public."current_role"() = 'responsable' then
    if NEW.technicien_id is distinct from OLD.technicien_id then
      raise exception 'Vous ne pouvez pas modifier l''assignation du technicien.';
    end if;
    if NEW.statut is distinct from OLD.statut then
      raise exception 'Vous ne pouvez pas changer le statut du ticket.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_responsable_ticket_update on public.tickets;
create trigger trg_prevent_responsable_ticket_update
  before update on public.tickets
  for each row
  execute function public.prevent_responsable_ticket_update();

-- ---------------------------------------------------------------------------
-- 5. DONNÉES DE DÉMO (optionnel — à retirer ou adapter en production)
-- ---------------------------------------------------------------------------

insert into public.laboratoires (nom, ville, telephone)
values ('Laboratoire BioPlus Tunis', 'Tunis', '+216 71 000 000')
on conflict do nothing;

insert into public.laboratoires (nom, adresse, ville, telephone)
values ('Laboratoire Clinique Ibn Sina', '12 avenue Habib Bourguiba', 'La Marsa', '+216 71 111 222')
on conflict do nothing;

insert into public.automates (laboratoire_id, nom, modele, numero_serie)
select id, 'Pentra 60', 'Horiba ABX Pentra 60', 'P60-0001'
from public.laboratoires
where nom = 'Laboratoire BioPlus Tunis'
  and not exists (select 1 from public.automates where numero_serie = 'P60-0001');

insert into public.automates (laboratoire_id, nom, modele, numero_serie)
select id, 'Pentra 60 CXP', 'Horiba ABX Pentra 60 CXP', 'P60-0002'
from public.laboratoires
where nom = 'Laboratoire Clinique Ibn Sina'
  and not exists (select 1 from public.automates where numero_serie = 'P60-0002');

-- Après avoir créé un utilisateur dans Authentication > Users, lui affecter un laboratoire :
-- update public.profiles
-- set laboratoire_id = (select id from public.laboratoires where nom = 'Laboratoire BioPlus Tunis'),
--     role = 'technicien'
-- where user_id = 'UUID_DE_L_UTILISATEUR';