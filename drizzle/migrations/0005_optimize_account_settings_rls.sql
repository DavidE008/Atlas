-- Wrap auth.uid() so Postgres can evaluate it once per statement.
DROP POLICY "users read own account settings" ON public.account_settings;
DROP POLICY "users insert own account settings" ON public.account_settings;
DROP POLICY "users update own account settings" ON public.account_settings;

CREATE POLICY "users read own account settings" ON public.account_settings
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "users insert own account settings" ON public.account_settings
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "users update own account settings" ON public.account_settings
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
