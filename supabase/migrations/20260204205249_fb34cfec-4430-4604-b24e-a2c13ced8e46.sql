-- Add per-organ numbers toggle to settings
ALTER TABLE public.settings 
ADD COLUMN per_organ_numbers_enabled boolean DEFAULT false;

COMMENT ON COLUMN public.settings.per_organ_numbers_enabled IS 'When enabled, each organ uses its own ticket number sequence instead of global settings';