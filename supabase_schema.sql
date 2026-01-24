
-- Create the table for storing analysis history
create table public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_size bigint, -- File size in bytes
  metadata jsonb, -- Store GeoJSON feature count, geometry type, etc.
  analysis_results jsonb, -- Store the chart data and other results
  thumbnail_url text, -- Optional: URL to a map snapshot
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) if you want to restrict access
-- For now, allowing all inserts and reads for simplicity (anonymous access)
alter table public.analysis_history enable row level security;

create policy "Allow all operations for now"
on public.analysis_history
for all
using (true)
with check (true);
