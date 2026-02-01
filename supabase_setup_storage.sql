-- Enable the storage extension if not already enabled (usually enabled by default)
-- create extension if not exists "storage" schema "extensions";

-- 1. Create the 'thumbnails' bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

-- 2. Enable RLS on storage.objects (good practice, though often on by default)
alter table storage.objects enable row level security;

-- 3. Policy: Allow Public Read Access to 'thumbnails'
create policy "Public Access Thumbnails"
on storage.objects for select
using ( bucket_id = 'thumbnails' );

-- 4. Policy: Allow Anonymous Uploads to 'thumbnails'
-- Note: In production, consider restricting this to authenticated users or specific paths
create policy "Allow Anon Uploads Thumbnails"
on storage.objects for insert
with check ( bucket_id = 'thumbnails' );

-- 5. Policy: Allow Update/Delete (Optional - use with caution)
-- create policy "Allow Anon Update Thumbnails"
-- on storage.objects for update
-- using ( bucket_id = 'thumbnails' );
