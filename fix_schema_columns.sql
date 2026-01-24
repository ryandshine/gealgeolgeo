-- FIX: Ensure geom_geojson column exists in master_lahan
-- This handles the case where the table was created by an earlier script version without this column.

ALTER TABLE public.master_lahan 
ADD COLUMN IF NOT EXISTS geom_geojson jsonb;

-- Optional: Add comment
COMMENT ON COLUMN public.master_lahan.geom_geojson IS 'Stores the raw GeoJSON for frontend retrieval';
