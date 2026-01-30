---
name: admin-catalog-manager
description: Design and implement an admin catalog system for products/materials/suppliers with Supabase schemas, RLS policies, image uploads, stock control, and frontend admin UI plus Create page carousel integration. Use when the user asks for secure admin access, catalog CRUD, inventory availability, image handling, or adapting Create.tsx to show dynamic parts/subparts.
---

# Admin Catalog Manager

## Overview

Create a secure admin surface and data model so large organizations can manage products, materials, suppliers, and stock availability, and expose those items correctly on the public Create experience.

## Workflow Decision Tree

- If the request is primarily about **data model or RLS**, load `references/schema.md` and `references/rls.md`.
- If the request is about **image uploads or storage**, load `references/storage.md`.
- If the request is about **admin UI or access control**, load `references/ui-admin.md`.
- If the request is about **Create.tsx carousels or dynamic types/subtypes**, load `references/create-integration.md`.

## Core Workflow

1. Map the domain: products, parts, subparts, materials, suppliers, stock, and images.
2. Implement Supabase tables and foreign keys.
3. Add RLS policies for admin-only writes and public reads of `available` items.
4. Configure storage bucket and signed/public URLs for images.
5. Build admin UI (list + create/edit + image upload + stock adjustments).
6. Adapt `Create.tsx` to render dynamic parts/subparts from the database.
7. Add minimal validation and smoke tests.

## Quality Bar

Follow these non-negotiables:
- Enforce admin access with RLS; do not rely on client checks.
- Keep public reads limited to `available = true`.
- Store images in a dedicated bucket and only save URLs/paths in tables.
- Keep Create page resilient to missing data and empty states.

## References

Use these reference files when needed:
- `references/schema.md`
- `references/rls.md`
- `references/storage.md`
- `references/ui-admin.md`
- `references/create-integration.md`
