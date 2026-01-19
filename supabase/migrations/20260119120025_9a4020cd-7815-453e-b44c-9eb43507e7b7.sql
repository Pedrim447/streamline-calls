-- Create enum for ticket types
CREATE TYPE public.ticket_type AS ENUM ('normal', 'preferential');

-- Create enum for ticket status
CREATE TYPE public.ticket_status AS ENUM ('waiting', 'called', 'in_service', 'completed', 'cancelled', 'skipped');

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'attendant');

-- Create units table (for multi-location support)
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1e40af',
  secondary_color TEXT DEFAULT '#3b82f6',
  voice_message_template TEXT DEFAULT 'Senha {ticket}, guichê {counter}',
  voice_enabled BOOLEAN DEFAULT true,
  voice_speed NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  current_session_id TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create counters table (guichês)
CREATE TABLE public.counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  number INTEGER NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  current_attendant_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, number)
);

-- Create tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  ticket_number INTEGER NOT NULL,
  ticket_type ticket_type NOT NULL DEFAULT 'normal',
  display_code TEXT NOT NULL,
  status ticket_status NOT NULL DEFAULT 'waiting',
  priority INTEGER NOT NULL DEFAULT 0,
  counter_id UUID REFERENCES public.counters(id) ON DELETE SET NULL,
  attendant_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  called_at TIMESTAMPTZ,
  service_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  skip_reason TEXT,
  cancel_reason TEXT,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create daily counters for ticket numbers
CREATE TABLE public.ticket_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  ticket_type ticket_type NOT NULL,
  counter_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_number INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, ticket_type, counter_date)
);

-- Create audit_logs table (immutable)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create settings table (unit-specific)
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL UNIQUE,
  auto_reset_daily BOOLEAN DEFAULT true,
  reset_time TIME DEFAULT '06:00:00',
  lock_timeout_seconds INTEGER DEFAULT 30,
  max_retry_attempts INTEGER DEFAULT 3,
  preferential_priority INTEGER DEFAULT 10,
  normal_priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's unit
CREATE OR REPLACE FUNCTION public.get_user_unit_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unit_id
  FROM public.profiles
  WHERE user_id = _user_id
$$;

-- RLS Policies for units
CREATE POLICY "Users can view their own unit"
ON public.units FOR SELECT
TO authenticated
USING (id = public.get_user_unit_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert units"
ON public.units FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update their unit"
ON public.units FOR UPDATE
TO authenticated
USING (id = public.get_user_unit_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their unit"
ON public.profiles FOR SELECT
TO authenticated
USING (unit_id = public.get_user_unit_id(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admins can update profiles in their unit"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND unit_id = public.get_user_unit_id(auth.uid()));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for counters
CREATE POLICY "Users can view counters in their unit"
ON public.counters FOR SELECT
TO authenticated
USING (unit_id = public.get_user_unit_id(auth.uid()));

CREATE POLICY "Admins can manage counters"
ON public.counters FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND unit_id = public.get_user_unit_id(auth.uid()));

-- RLS Policies for tickets
CREATE POLICY "Users can view tickets in their unit"
ON public.tickets FOR SELECT
TO authenticated
USING (unit_id = public.get_user_unit_id(auth.uid()));

CREATE POLICY "Users can insert tickets"
ON public.tickets FOR INSERT
TO authenticated
WITH CHECK (unit_id = public.get_user_unit_id(auth.uid()));

CREATE POLICY "Users can update tickets in their unit"
ON public.tickets FOR UPDATE
TO authenticated
USING (unit_id = public.get_user_unit_id(auth.uid()));

-- RLS Policies for ticket_counters
CREATE POLICY "Users can view ticket counters in their unit"
ON public.ticket_counters FOR SELECT
TO authenticated
USING (unit_id = public.get_user_unit_id(auth.uid()));

CREATE POLICY "Users can manage ticket counters"
ON public.ticket_counters FOR ALL
TO authenticated
USING (unit_id = public.get_user_unit_id(auth.uid()));

-- RLS Policies for audit_logs (read only for admins, no delete)
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND (unit_id IS NULL OR unit_id = public.get_user_unit_id(auth.uid())));

CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- RLS Policies for settings
CREATE POLICY "Users can view settings for their unit"
ON public.settings FOR SELECT
TO authenticated
USING (unit_id = public.get_user_unit_id(auth.uid()));

CREATE POLICY "Admins can manage settings"
ON public.settings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND unit_id = public.get_user_unit_id(auth.uid()));

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_units_updated_at
BEFORE UPDATE ON public.units
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_counters_updated_at
BEFORE UPDATE ON public.counters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_counters_updated_at
BEFORE UPDATE ON public.ticket_counters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user creation (create profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for tickets table
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.counters;

-- Create indexes for performance
CREATE INDEX idx_tickets_unit_status ON public.tickets(unit_id, status);
CREATE INDEX idx_tickets_unit_date ON public.tickets(unit_id, created_at);
CREATE INDEX idx_tickets_locked ON public.tickets(locked_by, locked_at);
CREATE INDEX idx_audit_logs_unit_date ON public.audit_logs(unit_id, created_at);
CREATE INDEX idx_profiles_unit ON public.profiles(unit_id);
CREATE INDEX idx_counters_unit ON public.counters(unit_id);