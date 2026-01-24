-- Enable PostGIS if not already enabled (standard on Supabase)
create extension if not exists postgis;

-- 1. Create master_lahan table for permanent geometry storage
create table if not exists public.master_lahan (
  id uuid primary key default gen_random_uuid(),
  geom geometry(MultiPolygon, 4326), -- PostGIS geometry column for spatial ops
  geom_geojson jsonb, -- JSONB column for easy frontend retrieval
  geom_hash text unique, -- To identify duplicates (e.g. MD5 of GeoJSON)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Add lahan_id foreign key to analysis_history
alter table public.analysis_history 
add column if not exists lahan_id uuid references public.master_lahan(id);

-- Optional: Create index for faster joins
create index if not exists idx_analysis_history_lahan_id on public.analysis_history(lahan_id);

-- 3. Policy for master_lahan (allow public access for simplicity as requested)
alter table public.master_lahan enable row level security;

create policy "Allow all operations for master_lahan"
on public.master_lahan
for all
using (true)
with check (true);
