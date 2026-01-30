# Create.tsx integration

Goal: replace static clothingTypes + specificModels with DB-driven parts/types/subtypes.

## Data shape (recommended)
Fetch from Supabase:
- parts (id, slug, name, description, sort_order)
- product_types (id, part_id, name, description, card_image_path)
- product_subtypes (id, type_id, name, description, card_image_path)

Then build:
- bodyPartOptions from parts
- typeOptions filtered by selectedPart
- subtypeOptions filtered by selectedType

## Mapping tips
- Use slug for stable ids in UI, or map to ids and store both.
- Normalize search with existing normalizeText helper.
- Include image URLs in carousel card data.
- Respect is_active to hide items.

## Fallback
If no data is returned (first run), fallback to static arrays to avoid empty UI.

## Minimal state changes
- Replace clothingTypes and specificModels with fetched arrays + maps.
- Keep existing selection logic (selectedPart/Type/Subtype).
- Update card description to use DB description.
