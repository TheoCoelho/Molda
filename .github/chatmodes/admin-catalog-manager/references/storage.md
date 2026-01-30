# Storage: product images

## Bucket
Create bucket: product-images
- If public bucket: allow select for everyone, write for admin only.
- If private: use signed URLs in frontend.

## Path convention
product-images/products/{product_id}/{uuid}.{ext}
product-images/types/{type_id}/{uuid}.{ext}
product-images/subtypes/{subtype_id}/{uuid}.{ext}

## Storage policies (public bucket example)
create policy "public read images" on storage.objects
for select using (bucket_id = 'product-images');

create policy "admin write images" on storage.objects
for all using (bucket_id = 'product-images' and is_admin())
with check (bucket_id = 'product-images' and is_admin());

## Frontend
- Save only the path in DB (image_path or card_image_path).
- Use supabase.storage.from('product-images').getPublicUrl(path)
  or createSignedUrl for private buckets.
