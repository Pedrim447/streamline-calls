-- Create a default unit for the system
INSERT INTO public.units (id, name, primary_color, secondary_color, voice_enabled, voice_speed)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Unidade Principal',
  '#2563eb',
  '#1e40af',
  true,
  1.0
) ON CONFLICT (id) DO NOTHING;

-- Create default settings for the unit
INSERT INTO public.settings (unit_id, normal_priority, preferential_priority, auto_reset_daily, reset_time)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  5,
  10,
  true,
  '00:00:00'
) ON CONFLICT (unit_id) DO NOTHING;

-- Create default counters (guichês 1-5)
INSERT INTO public.counters (unit_id, number, name, is_active)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 1, 'Guichê 1', true),
  ('a0000000-0000-0000-0000-000000000001', 2, 'Guichê 2', true),
  ('a0000000-0000-0000-0000-000000000001', 3, 'Guichê 3', true),
  ('a0000000-0000-0000-0000-000000000001', 4, 'Guichê 4', false),
  ('a0000000-0000-0000-0000-000000000001', 5, 'Guichê 5', false)
ON CONFLICT DO NOTHING;