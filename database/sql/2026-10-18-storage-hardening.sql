-- 2026-10-18 — Storage hardening for the avatars bucket.
-- BEFORE: INSERT/UPDATE policies were bucket-only checks with roles={public} —
-- ANY unauthenticated visitor could upload arbitrary files anywhere in the
-- bucket and OVERWRITE other users' avatar objects (upsert path).
-- AFTER: write ops require an authenticated user owning the top-level folder
-- (objects are written as "<auth.uid()>/avatar.<ext>" by the app), public
-- read kept, bucket-level MIME allowlist + 2MB size cap enforced server-side.

-- 1) drop loose policies
DROP POLICY IF EXISTS "Anyone can upload an avatar." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update their own avatar." ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;

-- 2) correct policies (owner-scoped writes, public read)
CREATE POLICY "Avatar images are publicly accessible."
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload to their own avatar folder."
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own avatar files."
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own avatar files."
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) bucket-level hard limits (enforced by storage server, cannot be bypassed
--    by any client) — png/jpeg/webp for user photos, svg+xml for the preset
--    avatar path in settings.
UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
WHERE id = 'avatars';
