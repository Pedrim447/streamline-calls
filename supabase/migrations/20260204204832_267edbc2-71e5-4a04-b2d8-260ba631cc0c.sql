-- Add minimum ticket number columns to organs table
ALTER TABLE public.organs 
ADD COLUMN min_number_normal integer DEFAULT 1,
ADD COLUMN min_number_preferential integer DEFAULT 1;

-- Add comment for clarity
COMMENT ON COLUMN public.organs.min_number_normal IS 'Minimum starting number for normal tickets in Atendimento Ação mode';
COMMENT ON COLUMN public.organs.min_number_preferential IS 'Minimum starting number for preferential tickets in Atendimento Ação mode';