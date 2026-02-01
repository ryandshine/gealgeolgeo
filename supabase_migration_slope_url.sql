-- Add slope_map_url to analysis_history
ALTER TABLE public.analysis_history
ADD COLUMN IF NOT EXISTS slope_map_url TEXT;

COMMENT ON COLUMN public.analysis_history.slope_map_url IS 'URL to the visual slope analysis map tile';
