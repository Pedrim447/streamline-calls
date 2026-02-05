-- Create enum for service type
CREATE TYPE public.service_type AS ENUM ('normal', 'preferential');

-- Add service_type column to profiles
ALTER TABLE public.profiles 
ADD COLUMN service_type public.service_type DEFAULT 'normal';

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.service_type IS 'Tipo de atendimento permitido para o usuário: normal ou preferential';