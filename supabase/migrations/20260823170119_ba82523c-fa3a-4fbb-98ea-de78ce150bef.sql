GRANT SELECT, INSERT ON public.server_setup_vault TO anon, authenticated;
DROP POLICY IF EXISTS "vault ciphertext readable" ON public.server_setup_vault;
CREATE POLICY "vault ciphertext readable" ON public.server_setup_vault FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "vault write once" ON public.server_setup_vault;
CREATE POLICY "vault write once" ON public.server_setup_vault FOR INSERT TO anon, authenticated WITH CHECK (true);