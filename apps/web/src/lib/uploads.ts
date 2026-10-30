import type { SupabaseClient } from "@supabase/supabase-js";

const imageTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const maxImageBytes = 5 * 1024 * 1024;

// Uploads a profile photo to the private profile-photos bucket, in the account's own folder, and returns its path.
export async function uploadProfilePhoto(client: SupabaseClient, userId: string, file: File): Promise<string> {
  const extension = imageTypes[file.type];
  if (!extension) {
    throw new Error("The photo must be a JPG, PNG or WebP file.");
  }
  if (file.size > maxImageBytes) {
    throw new Error("The photo must be 5 MB or smaller.");
  }
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from("profile-photos").upload(path, file, { contentType: file.type });
  if (error) {
    throw new Error(error.message);
  }
  return path;
}

// A short-lived link to a private profile photo, or null when there is none.
export async function profilePhotoUrl(client: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) {
    return null;
  }
  const { data } = await client.storage.from("profile-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// Uploads a pool photo to the public pool-images bucket and returns its public address.
// Throws a message staff can read when the file is not a usable image.
export async function uploadPoolPhoto(client: SupabaseClient, file: File): Promise<string> {
  const extension = imageTypes[file.type];
  if (!extension) {
    throw new Error("The photo must be a JPG, PNG or WebP file.");
  }
  if (file.size > maxImageBytes) {
    throw new Error("The photo must be 5 MB or smaller.");
  }
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from("pool-images").upload(path, file, { contentType: file.type });
  if (error) {
    throw new Error(error.message);
  }
  return client.storage.from("pool-images").getPublicUrl(path).data.publicUrl;
}
