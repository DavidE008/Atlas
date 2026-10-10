-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles are publicly readable" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Air quality grid points (Houston neighborhoods)
CREATE TABLE public.aq_grid_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL
);
GRANT SELECT ON public.aq_grid_points TO anon;
GRANT SELECT ON public.aq_grid_points TO authenticated;
GRANT ALL ON public.aq_grid_points TO service_role;
ALTER TABLE public.aq_grid_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grid points are publicly readable" ON public.aq_grid_points FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.aq_grid_points (name, latitude, longitude) VALUES
  ('Downtown', 29.7604, -95.3698),
  ('The Heights', 29.7989, -95.3986),
  ('Midtown', 29.7433, -95.3780),
  ('Third Ward', 29.7260, -95.3530),
  ('University of Houston', 29.7199, -95.3422),
  ('Montrose', 29.7407, -95.3897),
  ('Museum District', 29.7249, -95.3886),
  ('East Downtown', 29.7499, -95.3508),
  ('Ship Channel / Pasadena', 29.7111, -95.2091),
  ('Energy Corridor', 29.7806, -95.6230),
  ('Galleria / Uptown', 29.7396, -95.4619),
  ('Clear Lake', 29.5630, -95.0649),
  ('Katy', 29.7858, -95.8245),
  ('Kingwood', 30.0569, -95.1855),
  ('Sugar Land', 29.6197, -95.6349),
  ('Baytown', 29.7355, -94.9774);

-- Community reports
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  description text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  neighborhood text,
  photo_path text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports are publicly readable" ON public.reports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "users create own reports" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own reports" ON public.reports FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users delete own reports" ON public.reports FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- On-chain verifications (Solana attestations)
CREATE TABLE public.report_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  tx_signature text NOT NULL,
  wallet_address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_verifications TO anon;
GRANT SELECT, INSERT ON public.report_verifications TO authenticated;
GRANT ALL ON public.report_verifications TO service_role;
ALTER TABLE public.report_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verifications are publicly readable" ON public.report_verifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "authenticated users record verifications" ON public.report_verifications FOR INSERT TO authenticated WITH CHECK (true);