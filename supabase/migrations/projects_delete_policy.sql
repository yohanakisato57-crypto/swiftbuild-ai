DROP POLICY IF EXISTS "own projects delete" ON public.projects;
CREATE POLICY "own projects delete" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = user_id);