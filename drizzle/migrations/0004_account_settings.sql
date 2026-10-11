-- Private account preferences that should not be exposed through public profiles.
CREATE TABLE public.account_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.account_settings TO authenticated;
ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own account settings" ON public.account_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own account settings" ON public.account_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own account settings" ON public.account_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
