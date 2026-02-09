-- SQL para adicionar "Manga Longa" ao catálogo do Supabase
-- Execute no SQL Editor do Supabase

-- 1. Obter IDs (execute separadamente para verificar):
-- SELECT id FROM public.parts WHERE slug = 'torso';
-- SELECT id FROM public.product_types WHERE slug = 'shirt' AND part_id = (SELECT id FROM public.parts WHERE slug = 'torso');

-- 2. Adicione este registro na tabela product_subtypes:
-- Substitua <TYPE_ID> pelo ID real da tabela product_types para "shirt"

INSERT INTO public.product_subtypes (
  type_id,
  slug,
  name,
  description,
  sort_order,
  is_active
)
VALUES (
  (SELECT id FROM public.product_types WHERE slug = 'shirt' AND part_id = (SELECT id FROM public.parts WHERE slug = 'torso')),
  'long-sleeve',
  'Manga Longa',
  'Camiseta com mangas compridas',
  2,
  true
)
ON CONFLICT (type_id, slug) DO UPDATE
SET
  name = 'Manga Longa',
  description = 'Camiseta com mangas compridas',
  is_active = true;
