-- Add new columns to settings table for enhanced manual mode
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS manual_mode_min_number_preferential integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS calling_system_active boolean DEFAULT false;