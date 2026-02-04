-- Add atendimento_acao_enabled column to settings
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS atendimento_acao_enabled boolean DEFAULT false;