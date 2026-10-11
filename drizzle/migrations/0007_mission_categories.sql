ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_category_check;

UPDATE public.missions SET category = 'environment' WHERE category = 'cleanup';

ALTER TABLE public.missions
  ALTER COLUMN category SET DEFAULT 'environment',
  ADD COLUMN custom_category text,
  ADD COLUMN category_color text NOT NULL DEFAULT '#2B7453';

ALTER TABLE public.missions
  ADD CONSTRAINT missions_category_check
    CHECK (category IN ('environment', 'community', 'other')),
  ADD CONSTRAINT missions_custom_category_check
    CHECK (
      (category = 'other' AND custom_category IS NOT NULL AND char_length(btrim(custom_category)) BETWEEN 1 AND 40)
      OR (category <> 'other' AND custom_category IS NULL)
    ),
  ADD CONSTRAINT missions_category_color_check
    CHECK (category_color ~ '^#[0-9A-Fa-f]{6}$');
