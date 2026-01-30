# Admin UI + Access Control

## Route
- Add /admin route in App.tsx.
- Wrap with ProtectedRoute that checks auth session + role.

## Access control (client)
- Fetch profile (profiles.role) via Supabase on login.
- Redirect non-admin to /login or / (do not show admin UI).

## UI structure (recommended)
Tabs:
1) Products: list + create/edit + images + availability
2) Types: manage product_types (belongs to part)
3) Subtypes: manage product_subtypes (belongs to type)
4) Materials
5) Suppliers
6) Inventory: on_hand/reserved + movements

## UX details
- In product form: select part -> type -> subtype (filtered by type).
- Show card preview using image + description.
- Validate required fields before save.
- Use optimistic updates only if RLS is solid.
