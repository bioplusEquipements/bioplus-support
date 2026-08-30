import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { edge } from '../lib/edge';
import {
  supabase,
  type Automate,
  type Priorite
} from '../lib/supabaseClient';
import Spinner from '../components/Spinner';

export default function TicketCreation() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectId = params.get('automate_id');

  const [automates, setAutomates] = useState<Automate[]>([]);
  const [automateId, setAutomateId] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [messageErreur, setMessageErreur] = useState('');
  const [codeErreur, setCodeErreur] = useState('');
  const [description, setDescription] = useState('');
  const [priorite, setPriorite] = useState<Priorite>('normal');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoInfo, setPhotoInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const MAX_DIMENSION = 1280;
  const JPEG_QUALITY = 0.82;

  function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        URL.revokeObjectURL(url);
        if (!ctx) {
          reject(new Error('Compression de la photo impossible.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Compression de la photo impossible.'));
              return;
            }
            const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
            resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Photo illisible.'));
      };
      img.src = url;
    });
  }

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoInfo(null);
      return;
    }
    try {
      const compressed = await compressImage(file);
      setPhotoFile(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
      setPhotoInfo(
        `Compressée : ${Math.max(1, Math.round(compressed.size / 1024))} Ko (originale : ${Math.round(file.size / 1024)} Ko)`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo illisible.');
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoInfo(null);
    }
  }

  useEffect(() => {
    if (!profile?.laboratoire_id) {
      setLoading(false);
      return;
    }
    supabase
      .from('automates')
      .select('*')
      .eq('laboratoire_id', profile.laboratoire_id)
      .order('nom')
      .then(({ data, error: err }) => {
        if (!err && data) {
          const list = data as Automate[];
          setAutomates(list);
          const initial =
            preselectId && list.some((a) => a.id === preselectId)
              ? preselectId
              : (list[0]?.id ?? '');
          setAutomateId(initial);
        }
        setLoading(false);
      });
  }, [preselectId, profile?.laboratoire_id]);

  useEffect(() => {
    if (!profile?.laboratoire_id) return;
    supabase
      .from('laboratoires')
      .select('nom, est_client')
      .eq('id', profile.laboratoire_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.est_client === false) {
          setBlocked(
            `${data.nom} est le service technique de BioPlus, pas un laboratoire client : il ne peut pas créer de réclamations.`
          );
        }
      });
  }, [profile?.laboratoire_id]);

  useEffect(() => {
    const a = automates.find((x) => x.id === automateId);
    setNumeroSerie(a?.numero_serie ?? '');
  }, [automateId, automates]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!automateId) {
      setError('Sélectionnez un automate.');
      return;
    }
    if (!description.trim()) {
      setError('La description du problème est obligatoire.');
      return;
    }

    setSubmitting(true);
    try {
      let photoPath: string | null = null;

      if (photoFile && profile?.laboratoire_id) {
        const fileName = `${profile.laboratoire_id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('photos')
          .upload(fileName, photoFile, { cacheControl: '3600', upsert: false });
        if (upErr) throw new Error(`Upload de la photo impossible : ${upErr.message}`);
        photoPath = fileName;
      }

      const { data, error: insertErr } = await supabase
        .from('tickets')
        .insert({
          laboratoire_id: profile?.laboratoire_id,
          automate_id: automateId,
          numero_serie: numeroSerie || null,
          message_erreur: messageErreur.trim() || null,
          code_erreur: codeErreur.trim() || null,
          description: description.trim(),
          photo_path: photoPath,
          priorite,
          statut: 'ouvert'
        })
        .select()
        .single();

      if (insertErr) {
        if (photoPath) await supabase.storage.from('photos').remove([photoPath]);
        throw new Error(insertErr.message);
      }

      if (priorite === 'critique') {
        edge('notify', { type: 'critique', ticket_id: (data as { id: string }).id });
      }

      navigate(`/ticket/${(data as { id: string }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création du ticket impossible.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner label="Chargement des automates..." />;

  if (blocked) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
        <header className="mb-4">
          <h1 className="text-lg font-bold text-slate-900 page-title">Nouveau ticket</h1>
        </header>
        <div className="card border-red-200 bg-red-50 text-sm text-red-700">
          {blocked}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4 lg:max-w-6xl lg:p-8">
      <header className="mb-4">
        <h1 className="text-lg font-bold text-slate-900 page-title">Nouveau ticket</h1>
        <p className="text-xs text-slate-500">
          Laboratoire : {profile?.laboratoire_id ? 'rattaché' : 'non défini'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="automate" className="label">
            Automate
          </label>
          <select
            id="automate"
            value={automateId}
            onChange={(e) => setAutomateId(e.target.value)}
            disabled={automates.length === 0}
            className="input"
          >
            {automates.length === 0 && <option value="">Aucun automate disponible</option>}
            {automates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom} {a.modele ? `· ${a.modele}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">N° de série (lecture seule)</label>
          <input
            type="text"
            value={numeroSerie}
            readOnly
            disabled
            className="input font-mono"
            placeholder="Renseigné automatiquement"
          />
        </div>

        <div>
          <label htmlFor="message_erreur" className="label">
            Message d'erreur
          </label>
          <input
            id="message_erreur"
            type="text"
            value={messageErreur}
            onChange={(e) => setMessageErreur(e.target.value)}
            className="input"
            placeholder="Ex : WBC clumped"
          />
        </div>

        <div>
          <label htmlFor="code_erreur" className="label">
            Code erreur
          </label>
          <input
            id="code_erreur"
            type="text"
            value={codeErreur}
            onChange={(e) => setCodeErreur(e.target.value)}
            className="input font-mono"
            placeholder="Ex : 0x2A11"
          />
        </div>

        <div>
          <label htmlFor="description" className="label">
            Description du problème *
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            className="input resize-none"
            placeholder="Décrivez le dysfonctionnement, les circonstances, les mesures déjà prises..."
          />
        </div>

        <div>
          <label htmlFor="priorite" className="label">
            Priorité
          </label>
          <select
            id="priorite"
            value={priorite}
            onChange={(e) => setPriorite(e.target.value as Priorite)}
            className="input"
          >
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="critique">Critique</option>
          </select>
        </div>

        <div>
          <label htmlFor="photo" className="label">
            Photo (optionnelle)
          </label>
          <input
            id="photo"
            type="file"
            accept="image/*"
            onChange={handlePhoto}
            className="input file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          />
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Aperçu"
              className="mt-2 h-40 w-full rounded-lg object-cover"
            />
          )}
          {photoInfo && <p className="mt-1 text-xs text-slate-500">{photoInfo}</p>}
          <p className="mt-1 text-xs text-slate-400">
            Photo compressée automatiquement (~100 Ko) avant envoi — stockée dans le bucket
            « photos » (dossier de votre laboratoire), jamais en base64.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
          {submitting ? 'Création en cours...' : 'Créer le ticket'}
        </button>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-outline w-full"
        >
          Annuler
        </button>
      </form>
    </div>
  );
}