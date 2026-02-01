-- Migration: Create custom_pins table for storing user-placed map pins
-- Date: 2026-02-01
-- Description: Global pins that can be placed on the map by users

-- Create custom_pins table
CREATE TABLE IF NOT EXISTS public.custom_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    label TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_custom_pins_created_at ON public.custom_pins(created_at DESC);

-- Add comment to table
COMMENT ON TABLE public.custom_pins IS 'Stores custom map pins created by users';

-- Add comments to columns
COMMENT ON COLUMN public.custom_pins.id IS 'Unique identifier for the pin';
COMMENT ON COLUMN public.custom_pins.lat IS 'Latitude coordinate';
COMMENT ON COLUMN public.custom_pins.lng IS 'Longitude coordinate';
COMMENT ON COLUMN public.custom_pins.label IS 'User-defined label for the pin';
COMMENT ON COLUMN public.custom_pins.created_at IS 'Timestamp when pin was created';
COMMENT ON COLUMN public.custom_pins.updated_at IS 'Timestamp when pin was last updated';

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_pins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_custom_pins_updated_at ON public.custom_pins;
CREATE TRIGGER trigger_update_custom_pins_updated_at
    BEFORE UPDATE ON public.custom_pins
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_pins_updated_at();

-- Grant permissions (adjust based on your RLS policies)
-- For now, allowing public access since it's global pins
ALTER TABLE public.custom_pins ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read pins
CREATE POLICY "Allow public read access to custom pins"
    ON public.custom_pins
    FOR SELECT
    USING (true);

-- Policy: Allow anyone to insert pins
CREATE POLICY "Allow public insert access to custom pins"
    ON public.custom_pins
    FOR INSERT
    WITH CHECK (true);

-- Policy: Allow anyone to update pins
CREATE POLICY "Allow public update access to custom pins"
    ON public.custom_pins
    FOR UPDATE
    USING (true);

-- Policy: Allow anyone to delete pins
CREATE POLICY "Allow public delete access to custom pins"
    ON public.custom_pins
    FOR DELETE
    USING (true);
