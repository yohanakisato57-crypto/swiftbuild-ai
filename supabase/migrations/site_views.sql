CREATE TABLE IF NOT EXISTS public.site_views (
  id bigserial PRIMARY KEY,
  slug text NOT NULL,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_views_slug_idx ON public.site_views (slug, created_at);
ALTER TABLE public.site_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone can record a view" ON public.site_views;
CREATE POLICY "anyone can record a view" ON public.site_views FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "owners read their views" ON public.site_views;
CREATE POLICY "owners read their views" ON public.site_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.published_sites s WHERE s.slug = site_views.slug AND s.user_id = auth.uid()));