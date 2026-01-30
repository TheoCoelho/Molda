# Schema: Admin Catalog + Create Carousels

Goal: support dynamic parts/types/subtypes, products, materials, suppliers, images, and stock.
Prefer small, normalized tables with explicit sort order and flags.

## Tables (minimum viable)

### parts
- id (uuid, pk)
- slug (text, unique, e.g. head, torso, legs)
- name (text)
- description (text, null)
- sort_order (int)
- is_active (bool, default true)
- created_at (timestamptz, default now())

### product_types
- id (uuid, pk)
- part_id (uuid, fk -> parts.id)
- slug (text, unique per part)
- name (text)
- description (text, null)
- card_image_path (text, null)  -- storage path
- sort_order (int)
- is_active (bool, default true)

### product_subtypes
- id (uuid, pk)
- type_id (uuid, fk -> product_types.id)
- slug (text, unique per type)
- name (text)
- description (text, null)
- card_image_path (text, null)
- sort_order (int)
- is_active (bool, default true)

### products
- id (uuid, pk)
- type_id (uuid, fk -> product_types.id)
- subtype_id (uuid, fk -> product_subtypes.id, null)
- sku (text, unique)
- name (text)
- description (text, null)
- available (bool, default true)
- visible (bool, default true)  -- public listing
- cover_image_path (text, null)
- created_at (timestamptz, default now())

### product_images
- id (uuid, pk)
- product_id (uuid, fk -> products.id)
- image_path (text) -- storage path
- alt_text (text, null)
- sort_order (int)

### materials
- id (uuid, pk)
- name (text)
- description (text, null)
- is_active (bool, default true)

### suppliers
- id (uuid, pk)
- name (text)
- email (text, null)
- phone (text, null)
- is_active (bool, default true)

### product_materials (m:n)
- product_id (uuid, fk -> products.id)
- material_id (uuid, fk -> materials.id)
- supplier_id (uuid, fk -> suppliers.id, null)
- primary key (product_id, material_id)

### inventory
- id (uuid, pk)
- product_id (uuid, fk -> products.id)
- on_hand (int, default 0)
- reserved (int, default 0)
- updated_at (timestamptz, default now())

### stock_movements (optional but recommended)
- id (uuid, pk)
- product_id (uuid, fk -> products.id)
- delta (int) -- positive or negative
- reason (text)
- created_at (timestamptz, default now())
- created_by (uuid, null) -- auth uid

## Notes
- Keep sort_order to control carousel order.
- Use is_active to hide items without deleting.
- In Create.tsx, use parts -> types -> subtypes to drive carousel choices.
- products are the actual sellable items; types/subtypes are for selection UX.
