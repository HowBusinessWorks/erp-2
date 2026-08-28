/**
 * Încărcarea unui fișier pe Supabase Storage, bucket `fisiere`.
 *
 * Un singur POST per fișier, ca în `uploadFile` din `app/actions/operability.ts` — încărcarea
 * în bucăți, cu reluare, rămâne în afara prototipului (PLAN.md §7).
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Urcă fișierul și întoarce cheia sub care a rămas în bucket. */
export async function uploadToStorage(file: File, keyPrefix: string): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Fișier peste 25 MB. Încărcarea în bucăți nu se construiește în prototip.");
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Storage neconfigurat: lipsesc cheile Supabase.");

  const storageKey = `${keyPrefix.replace(/\/+$/, "")}/${Date.now()}-${crypto.randomUUID()}`;

  const response = await fetch(`${base}/storage/v1/object/fisiere/${storageKey}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: await file.arrayBuffer(),
  });
  if (!response.ok) {
    throw new Error(`Încărcarea a eșuat (${response.status}). Verifică bucket-ul „fisiere”.`);
  }

  return storageKey;
}

/** Fișierele reale dintr-un câmp de formular, fără cele goale sau prea mari. */
export function pickedFiles(formData: FormData, field = "photos"): File[] {
  return formData
    .getAll(field)
    .filter((value): value is File => value instanceof File)
    .filter((file) => file.size > 0 && file.size <= MAX_UPLOAD_BYTES);
}
