
import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/constants/storage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UPLOAD_MODEL_API } from "@/lib/constants/storage";
import { invalidateModelCache } from "@/lib/models";
import DecalZoneEditor, { type DecalZoneDraft } from "@/components/admin/DecalZoneEditor";
import { parseColorList } from "@/lib/productColors";

type Part = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  is_active: boolean;
};

type ProductType = {
  id: string;
  part_id: string;
  slug: string;
  name: string;
  description?: string | null;
  card_image_path?: string | null;
  sort_order?: number | null;
  is_active: boolean;
};

type ProductSubtype = {
  id: string;
  type_id: string;
  slug: string;
  name: string;
  description?: string | null;
  card_image_path?: string | null;
  model_3d_path?: string | null;
  decal_zones_json?: DecalZoneDraft[] | null;
  print_area_width_cm?: number | null;
  print_area_height_cm?: number | null;
  min_decal_area_cm2?: number | null;
  neck_zone_y_min?: number | null;
  underarm_zone_y_min?: number | null;
  underarm_zone_y_max?: number | null;
  underarm_zone_abs_x_min?: number | null;
  sort_order?: number | null;
  is_active: boolean;
};

type Product = {
  id: string;
  type_id: string;
  subtype_id?: string | null;
  sku: string;
  name: string;
  description?: string | null;
  available: boolean;
  visible: boolean;
  cover_image_path?: string | null;
  available_colors?: string[] | null;
};

type Inventory = {
  id: string;
  product_id: string;
  on_hand: number;
  reserved: number;
};

type Material = {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
};

type Supplier = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  is_active: boolean;
};

type PrintingMethod = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  is_active: boolean;
};

type MaterialPrintingMethod = {
  material_id: string;
  printing_method_id: string;
};

type ProductMaterial = {
  product_id: string;
  material_id: string;
  supplier_id?: string | null;
};

type SubtypeMaterial = {
  subtype_id: string;
  material_id: string;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const toNumber = (value: string | number | null | undefined, fallback = 0) => {
  const num = typeof value === "string" ? Number(value) : value ?? fallback;
  return Number.isFinite(num) ? (num as number) : fallback;
};

const toNullableNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? (num as number) : null;
};

const parseDecalZones = (value: unknown): DecalZoneDraft[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((zone) => {
      if (!zone || typeof zone !== "object") return null;
      const z = zone as Record<string, unknown>;
      const behavior = z.behavior === "constrain" ? "constrain" : "block";
      const name = String(z.name || "zone");
      const maxDecalSize = z.maxDecalSize == null ? undefined : Number(z.maxDecalSize);

      if (z.kind === "stroke") {
        const pointsRaw = Array.isArray(z.points) ? z.points : [];
        const points = pointsRaw
          .map((p) => (Array.isArray(p) && p.length === 3 ? [Number(p[0]), Number(p[1]), Number(p[2])] : null))
          .filter((p): p is [number, number, number] => !!p && p.every((n) => Number.isFinite(n)));
        const normalsRaw = Array.isArray(z.normals) ? z.normals : [];
        const normals = normalsRaw
          .map((p) => (Array.isArray(p) && p.length === 3 ? [Number(p[0]), Number(p[1]), Number(p[2])] : null))
          .filter((p): p is [number, number, number] => !!p && p.every((n) => Number.isFinite(n)));
        const width = Number(z.width);
        if (!points.length || !Number.isFinite(width) || width <= 0) return null;
        return {
          kind: "stroke",
          name,
          points,
          normals: normals.length ? normals : undefined,
          width,
          behavior,
          maxDecalSize: Number.isFinite(maxDecalSize) ? maxDecalSize : undefined,
        } satisfies DecalZoneDraft;
      }

      const center = Array.isArray(z.center) ? z.center : [];
      if (center.length !== 3) return null;
      const cx = Number(center[0]);
      const cy = Number(center[1]);
      const cz = Number(center[2]);
      const normalRaw = Array.isArray(z.normal) && z.normal.length === 3 ? z.normal : null;
      const nx = normalRaw ? Number(normalRaw[0]) : NaN;
      const ny = normalRaw ? Number(normalRaw[1]) : NaN;
      const nz = normalRaw ? Number(normalRaw[2]) : NaN;
      const radius = Number(z.radius);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) || !Number.isFinite(radius)) {
        return null;
      }
      return {
        name,
        center: [cx, cy, cz] as [number, number, number],
        normal: Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)
          ? [nx, ny, nz] as [number, number, number]
          : undefined,
        radius,
        behavior,
        maxDecalSize: Number.isFinite(maxDecalSize) ? maxDecalSize : undefined,
      } satisfies DecalZoneDraft;
    })
    .filter((z): z is DecalZoneDraft => !!z);
};

const Admin = () => {
  const [loading, setLoading] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [types, setTypes] = useState<ProductType[]>([]);
  const [subtypes, setSubtypes] = useState<ProductSubtype[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [printingMethods, setPrintingMethods] = useState<PrintingMethod[]>([]);
  const [materialPrintingMethods, setMaterialPrintingMethods] = useState<MaterialPrintingMethod[]>([]);
  const [productMaterials, setProductMaterials] = useState<ProductMaterial[]>([]);
  const [subtypeMaterials, setSubtypeMaterials] = useState<SubtypeMaterial[]>([]);
  const [selectedSubtypeMaterialIds, setSelectedSubtypeMaterialIds] = useState<string[]>([]);

  const [typeForm, setTypeForm] = useState({
    id: "",
    part_id: "",
    name: "",
    slug: "",
    description: "",
    sort_order: "0",
    is_active: true,
    card_image_path: "",
  });
  const [typeImageFile, setTypeImageFile] = useState<File | null>(null);
  const [typeImagePreview, setTypeImagePreview] = useState<string | null>(null);

  const [subtypeForm, setSubtypeForm] = useState({
    id: "",
    type_id: "",
    name: "",
    slug: "",
    description: "",
    sort_order: "0",
    is_active: true,
    card_image_path: "",
    model_3d_path: "",
    print_area_width_cm: "",
    print_area_height_cm: "",
    min_decal_area_cm2: "5",
    neck_zone_y_min: "0.82",
    underarm_zone_y_min: "0.45",
    underarm_zone_y_max: "0.72",
    underarm_zone_abs_x_min: "0.55",
  });
  const [subtypeImageFile, setSubtypeImageFile] = useState<File | null>(null);
  const [subtypeImagePreview, setSubtypeImagePreview] = useState<string | null>(null);
  const [subtypeModelFile, setSubtypeModelFile] = useState<FileList | null>(null);
  const [subtypeDecalZones, setSubtypeDecalZones] = useState<DecalZoneDraft[]>([]);

  const [productForm, setProductForm] = useState({
    id: "",
    type_id: "",
    subtype_id: "",
    material_id: "",
    sku: "",
    name: "",
    description: "",
    available_colors_text: "",
    available: true,
    visible: true,
    cover_image_path: "",
  });
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);

  const [inventoryEdits, setInventoryEdits] = useState<Record<string, { on_hand: number; reserved: number }>>({});

  const [materialForm, setMaterialForm] = useState({
    id: "",
    name: "",
    description: "",
    is_active: true,
  });

  const [supplierForm, setSupplierForm] = useState({
    id: "",
    name: "",
    email: "",
    phone: "",
    is_active: true,
  });

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const [
        partsRes,
        typesRes,
        subtypesRes,
        productsRes,
        inventoryRes,
        materialsRes,
        suppliersRes,
        printingMethodsRes,
        materialPrintingMethodsRes,
        productMaterialsRes,
        subtypeMaterialsRes,
      ] = await Promise.all([
        supabase.from("parts").select("*").order("sort_order", { ascending: true }),
        supabase.from("product_types").select("*").order("sort_order", { ascending: true }),
        supabase.from("product_subtypes").select("*").order("sort_order", { ascending: true }),
        supabase.from("products").select("*").order("name", { ascending: true }),
        supabase.from("inventory").select("*"),
        supabase.from("materials").select("*").order("name", { ascending: true }),
        supabase.from("suppliers").select("*").order("name", { ascending: true }),
        supabase.from("printing_methods").select("*").order("sort_order", { ascending: true }),
        supabase.from("material_printing_methods").select("*"),
        supabase.from("product_materials").select("*"),
        supabase.from("subtype_materials").select("*"),
      ]);

      // Tabelas principais — erro aqui aborta o carregamento
      if (partsRes.error) throw partsRes.error;
      if (typesRes.error) throw typesRes.error;
      if (subtypesRes.error) throw subtypesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (inventoryRes.error) throw inventoryRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      // Tabelas de migração — falha silenciosa se ainda não existirem no DB
      if (printingMethodsRes.error) console.warn("[admin] printing_methods:", printingMethodsRes.error.message);
      if (materialPrintingMethodsRes.error) console.warn("[admin] material_printing_methods:", materialPrintingMethodsRes.error.message);
      if (productMaterialsRes.error) console.warn("[admin] product_materials:", productMaterialsRes.error.message);
      if (subtypeMaterialsRes.error) console.warn("[admin] subtype_materials:", subtypeMaterialsRes.error.message);

      setParts((partsRes.data as Part[]) || []);
      setTypes((typesRes.data as ProductType[]) || []);
      setSubtypes((subtypesRes.data as ProductSubtype[]) || []);
      setProducts((productsRes.data as Product[]) || []);
      setInventory((inventoryRes.data as Inventory[]) || []);
      setMaterials((materialsRes.data as Material[]) || []);
      setSuppliers((suppliersRes.data as Supplier[]) || []);
      setPrintingMethods((printingMethodsRes.data as PrintingMethod[]) || []);
      setMaterialPrintingMethods((materialPrintingMethodsRes.data as MaterialPrintingMethod[]) || []);
      setProductMaterials((productMaterialsRes.data as ProductMaterial[]) || []);
      setSubtypeMaterials((subtypeMaterialsRes.data as SubtypeMaterial[]) || []);
    } catch (err: any) {
      console.error("[admin.loadCatalog]", err);
      toast.error(err?.message || "Falha ao carregar dados do catalogo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (typeImageFile) {
      const url = URL.createObjectURL(typeImageFile);
      setTypeImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setTypeImagePreview(null);
  }, [typeImageFile]);

  useEffect(() => {
    if (subtypeImageFile) {
      const url = URL.createObjectURL(subtypeImageFile);
      setSubtypeImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setSubtypeImagePreview(null);
  }, [subtypeImageFile]);

  useEffect(() => {
    if (productImageFile) {
      const url = URL.createObjectURL(productImageFile);
      setProductImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setProductImagePreview(null);
  }, [productImageFile]);

  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const printingMethodById = useMemo(
    () => new Map(printingMethods.map((method) => [method.id, method])),
    [printingMethods]
  );
  const materialPrintingMethodIds = useMemo(() => {
    const map = new Map<string, string[]>();
    materialPrintingMethods.forEach((relation) => {
      const list = map.get(relation.material_id) ?? [];
      list.push(relation.printing_method_id);
      map.set(relation.material_id, list);
    });
    return map;
  }, [materialPrintingMethods]);
  const productMaterialByProductId = useMemo(() => {
    const map = new Map<string, ProductMaterial>();
    productMaterials.forEach((relation) => {
      if (!map.has(relation.product_id)) {
        map.set(relation.product_id, relation);
      }
    });
    return map;
  }, [productMaterials]);
  const materialPrintingNamesByMaterialId = useMemo(() => {
    const map = new Map<string, string[]>();
    materialPrintingMethods.forEach((relation) => {
      const method = printingMethodById.get(relation.printing_method_id);
      if (!method) return;
      const list = map.get(relation.material_id) ?? [];
      list.push(method.name);
      map.set(relation.material_id, list);
    });
    return map;
  }, [materialPrintingMethods, printingMethodById]);

  const subtypeMaterialIdsBySubtypeId = useMemo(() => {
    const map = new Map<string, string[]>();
    subtypeMaterials.forEach((rel) => {
      const list = map.get(rel.subtype_id) ?? [];
      list.push(rel.material_id);
      map.set(rel.subtype_id, list);
    });
    return map;
  }, [subtypeMaterials]);

  const inventoryByProductId = useMemo(
    () => new Map(inventory.map((inv) => [inv.product_id, inv])),
    [inventory]
  );
  useEffect(() => {
    const next: Record<string, { on_hand: number; reserved: number }> = {};
    products.forEach((product) => {
      const inv = inventoryByProductId.get(product.id);
      next[product.id] = {
        on_hand: inv?.on_hand ?? 0,
        reserved: inv?.reserved ?? 0,
      };
    });
    setInventoryEdits(next);
  }, [inventoryByProductId, products]);

  const getPublicUrl = useCallback((path?: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }, []);

  const uploadImage = useCallback(async (file: File, folder: string) => {
    const ext = file.name.split(".").pop() || "png";
    const safeName = slugify(file.name.replace(/\.[^/.]+$/, "")) || "image";
    const filename = `${Date.now()}-${safeName}.${ext}`;
    const path = `${folder}/${filename}`;
    const { error } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "image/*" });
    if (error) throw error;
    return path;
  }, []);

  const resetTypeForm = () => {
    setTypeForm({
      id: "",
      part_id: "",
      name: "",
      slug: "",
      description: "",
      sort_order: "0",
      is_active: true,
      card_image_path: "",
    });
    setTypeImageFile(null);
  };

  const resetSubtypeForm = () => {
    setSubtypeForm({
      id: "",
      type_id: "",
      name: "",
      slug: "",
      description: "",
      sort_order: "0",
      is_active: true,
      card_image_path: "",
      model_3d_path: "",
      print_area_width_cm: "",
      print_area_height_cm: "",
      min_decal_area_cm2: "5",
      neck_zone_y_min: "0.82",
      underarm_zone_y_min: "0.45",
      underarm_zone_y_max: "0.72",
      underarm_zone_abs_x_min: "0.55",
    });
    setSubtypeImageFile(null);
    setSubtypeModelFile(null);
    setSubtypeDecalZones([]);
    setSelectedSubtypeMaterialIds([]);
  };

  const resetProductForm = () => {
    setProductForm({
      id: "",
      type_id: "",
      subtype_id: "",
      material_id: "",
      sku: "",
      name: "",
      description: "",
      available_colors_text: "",
      available: true,
      visible: true,
      cover_image_path: "",
    });
    setProductImageFile(null);
  };

  const resetMaterialForm = () => {
    setMaterialForm({
      id: "",
      name: "",
      description: "",
      is_active: true,
    });
  };

  const resetSupplierForm = () => {
    setSupplierForm({
      id: "",
      name: "",
      email: "",
      phone: "",
      is_active: true,
    });
  };

  const handleSaveType = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      part_id: typeForm.part_id,
      name: typeForm.name.trim(),
      slug: (typeForm.slug || typeForm.name).trim() ? slugify(typeForm.slug || typeForm.name) : "",
      description: typeForm.description.trim() || null,
      sort_order: toNumber(typeForm.sort_order),
      is_active: typeForm.is_active,
      card_image_path: typeForm.card_image_path || null,
    };

    if (!payload.part_id || !payload.name || !payload.slug) {
      toast.error("Parte, nome e slug sao obrigatorios.");
      return;
    }

    try {
      if (typeImageFile) {
        payload.card_image_path = await uploadImage(typeImageFile, "types");
      }
      if (typeForm.id) {
        const { error } = await supabase.from("product_types").update(payload).eq("id", typeForm.id);
        if (error) throw error;
        toast.success("Tipo atualizado.");
      } else {
        const { error } = await supabase.from("product_types").insert(payload);
        if (error) throw error;
        toast.success("Tipo criado.");
      }
      resetTypeForm();
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.saveType]", err);
      toast.error(err?.message || "Falha ao salvar tipo.");
    }
  };

  const handleSaveSubtype = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: Record<string, any> = {
      type_id: subtypeForm.type_id,
      name: subtypeForm.name.trim(),
      slug: (subtypeForm.slug || subtypeForm.name).trim()
        ? slugify(subtypeForm.slug || subtypeForm.name)
        : "",
      description: subtypeForm.description.trim() || null,
      sort_order: toNumber(subtypeForm.sort_order),
      is_active: subtypeForm.is_active,
      card_image_path: subtypeForm.card_image_path || null,
      model_3d_path: subtypeForm.model_3d_path || null,
      decal_zones_json: subtypeDecalZones,
      print_area_width_cm: toNullableNumber(subtypeForm.print_area_width_cm),
      print_area_height_cm: toNullableNumber(subtypeForm.print_area_height_cm),
      min_decal_area_cm2: toNullableNumber(subtypeForm.min_decal_area_cm2) ?? 5,
      neck_zone_y_min: toNullableNumber(subtypeForm.neck_zone_y_min) ?? 0.82,
      underarm_zone_y_min: toNullableNumber(subtypeForm.underarm_zone_y_min) ?? 0.45,
      underarm_zone_y_max: toNullableNumber(subtypeForm.underarm_zone_y_max) ?? 0.72,
      underarm_zone_abs_x_min: toNullableNumber(subtypeForm.underarm_zone_abs_x_min) ?? 0.55,
    };

    const legacyPayload: Record<string, any> = {
      type_id: payload.type_id,
      name: payload.name,
      slug: payload.slug,
      description: payload.description,
      sort_order: payload.sort_order,
      is_active: payload.is_active,
      card_image_path: payload.card_image_path,
      model_3d_path: payload.model_3d_path,
    };

    const isMissingSubtypeConstraintColumn = (error: any) => {
      const message = String(error?.message || "");
      return (
        error?.code === "42703" ||
        error?.code === "PGRST204" ||
        message.includes("min_decal_area_cm2") ||
        message.includes("print_area_width_cm") ||
        message.includes("print_area_height_cm") ||
        message.includes("neck_zone_y_min") ||
        message.includes("underarm_zone_y_min") ||
        message.includes("underarm_zone_y_max") ||
        message.includes("underarm_zone_abs_x_min") ||
        message.includes("decal_zones_json")
      );
    };

    if (!payload.type_id || !payload.name || !payload.slug) {
      toast.error("Tipo, nome e slug sao obrigatorios.");
      return;
    }

    try {
      if (subtypeImageFile) {
        payload.card_image_path = await uploadImage(subtypeImageFile, "subtypes");
      }

      // Upload do modelo 3D via Vite plugin (múltiplos arquivos: .gltf + .bin + texturas)
      if (subtypeModelFile && subtypeModelFile.length > 0) {
        const formData = new FormData();
        for (let i = 0; i < subtypeModelFile.length; i++) {
          formData.append("file", subtypeModelFile[i]);
        }
        formData.append("slug", payload.slug as string);
        const uploadRes = await fetch(UPLOAD_MODEL_API, {
          method: "POST",
          body: formData,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson.success) {
          throw new Error(uploadJson.error || "Falha ao fazer upload do modelo 3D.");
        }
        payload.model_3d_path = uploadJson.path;
        const fileNames = uploadJson.files?.join(", ") || uploadJson.filename;
        toast.success(`Modelo 3D salvo: ${fileNames}`);
      }

      if (subtypeForm.id) {
        let { error } = await supabase
          .from("product_subtypes")
          .update(payload)
          .eq("id", subtypeForm.id);

        if (isMissingSubtypeConstraintColumn(error)) {
          const fallback = await supabase
            .from("product_subtypes")
            .update(legacyPayload)
            .eq("id", subtypeForm.id);
          error = fallback.error;
          if (!error) {
            toast.warning("Subtipo salvo sem colunas novas. Execute os SQL subtype_print_constraints.sql e 07_add_decal_zones_json.sql no Supabase para habilitar todos os campos.");
          }
        }

        if (error) throw error;
        toast.success("Subtipo atualizado.");
      } else {
        let { error } = await supabase.from("product_subtypes").insert(payload);

        if (isMissingSubtypeConstraintColumn(error)) {
          const fallback = await supabase.from("product_subtypes").insert(legacyPayload);
          error = fallback.error;
          if (!error) {
            toast.warning("Subtipo salvo sem colunas novas. Execute os SQL subtype_print_constraints.sql e 07_add_decal_zones_json.sql no Supabase para habilitar todos os campos.");
          }
        }

        if (error) throw error;
        toast.success("Subtipo criado.");
      }
      // Salva tecidos associados ao subtipo
      const savedSubtypeId = subtypeForm.id
        ? subtypeForm.id
        : (await supabase.from("product_subtypes").select("id").eq("slug", payload.slug as string).single()).data?.id;

      if (savedSubtypeId) {
        await supabase.from("subtype_materials").delete().eq("subtype_id", savedSubtypeId);
        if (selectedSubtypeMaterialIds.length > 0) {
          await supabase.from("subtype_materials").insert(
            selectedSubtypeMaterialIds.map((mid) => ({ subtype_id: savedSubtypeId, material_id: mid }))
          );
        }
      }

      // Invalida cache de modelos para que a nova config seja usada
      invalidateModelCache();
      resetSubtypeForm();
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.saveSubtype]", err);
      toast.error(err?.message || "Falha ao salvar subtipo.");
    }
  };


  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedAvailableColors = parseColorList(productForm.available_colors_text);
    const payload = {
      type_id: productForm.type_id,
      subtype_id: productForm.subtype_id || null,
      sku: productForm.sku.trim(),
      name: productForm.name.trim(),
      description: productForm.description.trim() || null,
      available_colors: parsedAvailableColors.length ? parsedAvailableColors : null,
      available: productForm.available,
      visible: productForm.visible,
      cover_image_path: productForm.cover_image_path || null,
    };

    const payloadLegacy = {
      type_id: payload.type_id,
      subtype_id: payload.subtype_id,
      sku: payload.sku,
      name: payload.name,
      description: payload.description,
      available: payload.available,
      visible: payload.visible,
      cover_image_path: payload.cover_image_path,
    };

    if (!payload.type_id || !payload.sku || !payload.name || !productForm.material_id) {
      toast.error("Tipo, tecido, SKU e nome sao obrigatorios.");
      return;
    }

    try {
      if (productImageFile) {
        payload.cover_image_path = await uploadImage(productImageFile, "products");
      }

      let productId = productForm.id;
      if (productForm.id) {
        let { data, error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", productForm.id)
          .select("id")
          .single();
        if (error && String(error.message || "").includes("available_colors")) {
          const fallback = await supabase
            .from("products")
            .update(payloadLegacy)
            .eq("id", productForm.id)
            .select("id")
            .single();
          data = fallback.data;
          error = fallback.error;
          if (!error) {
            toast.warning("Produto salvo sem cores disponiveis. Execute o SQL 10_add_product_available_colors.sql no Supabase.");
          }
        }
        if (error) throw error;
        productId = data.id;
        toast.success("Produto atualizado.");
      } else {
        let { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();
        if (error && String(error.message || "").includes("available_colors")) {
          const fallback = await supabase
            .from("products")
            .insert(payloadLegacy)
            .select("id")
            .single();
          data = fallback.data;
          error = fallback.error;
          if (!error) {
            toast.warning("Produto salvo sem cores disponiveis. Execute o SQL 10_add_product_available_colors.sql no Supabase.");
          }
        }
        if (error) throw error;
        productId = data.id;
        toast.success("Produto criado.");
      }

      if (!productId) {
        throw new Error("Nao foi possivel identificar o produto salvo.");
      }

      const { error: deleteProductMaterialsError } = await supabase
        .from("product_materials")
        .delete()
        .eq("product_id", productId);
      if (deleteProductMaterialsError) throw deleteProductMaterialsError;

      const { error: insertProductMaterialError } = await supabase.from("product_materials").insert({
        product_id: productId,
        material_id: productForm.material_id,
      });
      if (insertProductMaterialError) throw insertProductMaterialError;

      resetProductForm();
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.saveProduct]", err);
      toast.error(err?.message || "Falha ao salvar produto.");
    }
  };

  const handleDeleteSubtype = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o subtipo "${name}"?`)) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("product_subtypes").delete().eq("id", id);
      if (error) throw error;
      toast.success("Subtipo excluído com sucesso.");
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.handleDeleteSubtype]", err);
      toast.error(err?.message || "Falha ao excluir subtipo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMaterial = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: materialForm.name.trim(),
      description: materialForm.description.trim() || null,
      is_active: materialForm.is_active,
    };

    if (!payload.name) {
      toast.error("Nome do material e obrigatorio.");
      return;
    }

    try {
      if (materialForm.id) {
        const { error } = await supabase
          .from("materials")
          .update(payload)
          .eq("id", materialForm.id);
        if (error) throw error;
        toast.success("Tecido atualizado.");
      } else {
        const { error } = await supabase.from("materials").insert(payload);
        if (error) throw error;
        toast.success("Tecido criado.");
      }
      resetMaterialForm();
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.saveMaterial]", err);
      toast.error(err?.message || "Falha ao salvar material.");
    }
  };

  const handleSaveSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: supplierForm.name.trim(),
      email: supplierForm.email.trim() || null,
      phone: supplierForm.phone.trim() || null,
      is_active: supplierForm.is_active,
    };

    if (!payload.name) {
      toast.error("Nome do fornecedor e obrigatorio.");
      return;
    }

    try {
      if (supplierForm.id) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", supplierForm.id);
        if (error) throw error;
        toast.success("Fornecedor atualizado.");
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
        toast.success("Fornecedor criado.");
      }
      resetSupplierForm();
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.saveSupplier]", err);
      toast.error(err?.message || "Falha ao salvar fornecedor.");
    }
  };

  const handleSaveInventory = async (productId: string) => {
    const values = inventoryEdits[productId];
    if (!values) return;
    try {
      const payload = {
        product_id: productId,
        on_hand: Math.max(0, Math.floor(values.on_hand)),
        reserved: Math.max(0, Math.floor(values.reserved)),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("inventory").upsert(payload, { onConflict: "product_id" });
      if (error) throw error;
      toast.success("Estoque atualizado.");
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.saveInventory]", err);
      toast.error(err?.message || "Falha ao atualizar estoque.");
    }
  };

  const handleToggleMaterialPrintingMethod = async (
    materialId: string,
    printingMethodId: string,
    checked: boolean
  ) => {
    try {
      if (checked) {
        const { error } = await supabase
          .from("material_printing_methods")
          .insert({ material_id: materialId, printing_method_id: printingMethodId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("material_printing_methods")
          .delete()
          .eq("material_id", materialId)
          .eq("printing_method_id", printingMethodId);
        if (error) throw error;
      }
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.toggleMaterialPrintingMethod]", err);
      toast.error(err?.message || "Falha ao atualizar estamparia do tecido.");
    }
  };

  const activeSubtypesForType = useMemo(
    () => subtypes.filter((subtype) => subtype.type_id === productForm.type_id),
    [subtypes, productForm.type_id]
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin</p>
          <h1 className="text-3xl font-semibold">Catalogo e disponibilidade</h1>
          <p className="mt-2 text-sm text-muted-foreground">Gerencie tipos, subtipos, produtos e estoque do Create.</p>
        </div>

        <Tabs defaultValue="types">
          <TabsList className="flex flex-wrap gap-2">
            <TabsTrigger value="types">Tipos</TabsTrigger>
            <TabsTrigger value="subtypes">Subtipos</TabsTrigger>
            <TabsTrigger value="materials">Tecidos &amp; Estamparia</TabsTrigger>
            <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="inventory">Estoque</TabsTrigger>
          </TabsList>
          <TabsContent value="types" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <form onSubmit={handleSaveType} className="glass rounded-2xl border p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Novo tipo</h2>
                  <p className="text-xs text-muted-foreground">
                    Vincule o tipo a uma peca e escolha uma imagem para o card.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Peca</Label>
                  <select
                    value={typeForm.part_id}
                    onChange={(e) => setTypeForm((prev) => ({ ...prev, part_id: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {parts.map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={typeForm.name}
                    onChange={(e) => setTypeForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Camiseta"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    value={typeForm.slug}
                    onChange={(e) => setTypeForm((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="camiseta"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descricao</Label>
                  <Textarea
                    value={typeForm.description}
                    onChange={(e) => setTypeForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Descricao curta para o card"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={typeForm.sort_order}
                    onChange={(e) => setTypeForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Imagem do card</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setTypeImageFile(e.target.files?.[0] || null)} />
                  {typeImagePreview && (
                    <img src={typeImagePreview} alt="Preview" className="h-28 w-full rounded-lg object-cover" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch
                    checked={typeForm.is_active}
                    onCheckedChange={(value) => setTypeForm((prev) => ({ ...prev, is_active: value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={loading}>
                    {typeForm.id ? "Atualizar" : "Salvar"}
                  </Button>
                  {typeForm.id && (
                    <Button type="button" variant="ghost" onClick={resetTypeForm}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>

              <div className="space-y-3">
                {types.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    Nenhum tipo cadastrado.
                  </div>
                ) : (
                  types.map((typeItem) => (
                    <div
                      key={typeItem.id}
                      className={cn(
                        "glass rounded-xl border px-4 py-3 flex items-center justify-between gap-3",
                        !typeItem.is_active && "opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {typeItem.card_image_path && (
                          <img
                            src={getPublicUrl(typeItem.card_image_path) ?? undefined}
                            alt={typeItem.name}
                            className="h-12 w-12 rounded-lg object-cover border"
                          />
                        )}
                        <div>
                          <div className="text-sm font-semibold">{typeItem.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {partById.get(typeItem.part_id)?.name || "Sem peca"}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTypeForm({
                            id: typeItem.id,
                            part_id: typeItem.part_id,
                            name: typeItem.name,
                            slug: typeItem.slug,
                            description: typeItem.description || "",
                            sort_order: String(typeItem.sort_order ?? 0),
                            is_active: typeItem.is_active,
                            card_image_path: typeItem.card_image_path || "",
                          })
                        }
                      >
                        Editar
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="subtypes" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <form onSubmit={handleSaveSubtype} className="glass rounded-2xl border p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Novo subtipo</h2>
                  <p className="text-xs text-muted-foreground">
                    Subtipo herda o tipo (ex: Oversized dentro de Camiseta).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select
                    value={subtypeForm.type_id}
                    onChange={(e) => setSubtypeForm((prev) => ({ ...prev, type_id: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {types.map((typeItem) => (
                      <option key={typeItem.id} value={typeItem.id}>
                        {typeItem.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={subtypeForm.name}
                    onChange={(e) => setSubtypeForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Oversized"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    value={subtypeForm.slug}
                    onChange={(e) => setSubtypeForm((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="oversized"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descricao</Label>
                  <Textarea
                    value={subtypeForm.description}
                    onChange={(e) => setSubtypeForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Detalhes do subtipo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={subtypeForm.sort_order}
                    onChange={(e) => setSubtypeForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Area util de estampa (cm)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min="1"
                      step="0.1"
                      value={subtypeForm.print_area_width_cm}
                      onChange={(e) => setSubtypeForm((prev) => ({ ...prev, print_area_width_cm: e.target.value }))}
                      placeholder="Largura"
                    />
                    <Input
                      type="number"
                      min="1"
                      step="0.1"
                      value={subtypeForm.print_area_height_cm}
                      onChange={(e) => setSubtypeForm((prev) => ({ ...prev, print_area_height_cm: e.target.value }))}
                      placeholder="Altura"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Area minima do decal (cm²)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.1"
                    value={subtypeForm.min_decal_area_cm2}
                    onChange={(e) => setSubtypeForm((prev) => ({ ...prev, min_decal_area_cm2: e.target.value }))}
                    placeholder="5"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Zonas de alerta (normalizadas 0..1)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={subtypeForm.neck_zone_y_min}
                      onChange={(e) => setSubtypeForm((prev) => ({ ...prev, neck_zone_y_min: e.target.value }))}
                      placeholder="Gola y min"
                    />
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={subtypeForm.underarm_zone_abs_x_min}
                      onChange={(e) => setSubtypeForm((prev) => ({ ...prev, underarm_zone_abs_x_min: e.target.value }))}
                      placeholder="Abaixo manga |x| min"
                    />
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={subtypeForm.underarm_zone_y_min}
                      onChange={(e) => setSubtypeForm((prev) => ({ ...prev, underarm_zone_y_min: e.target.value }))}
                      placeholder="Abaixo manga y min"
                    />
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={subtypeForm.underarm_zone_y_max}
                      onChange={(e) => setSubtypeForm((prev) => ({ ...prev, underarm_zone_y_max: e.target.value }))}
                      placeholder="Abaixo manga y max"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Imagem do card</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setSubtypeImageFile(e.target.files?.[0] || null)} />
                  {subtypeImagePreview && (
                    <img src={subtypeImagePreview} alt="Preview" className="h-28 w-full rounded-lg object-cover" />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Modelo 3D (.glb ou .gltf + .bin + texturas)</Label>
                  <Input
                    type="file"
                    accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp"
                    multiple
                    onChange={(e) => setSubtypeModelFile(e.target.files || null)}
                  />
                  {subtypeModelFile && subtypeModelFile.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      <div className="flex items-center gap-2">
                        <span>📦</span>
                        <span className="font-medium">{subtypeModelFile.length} arquivo(s) selecionado(s)</span>
                      </div>
                      {Array.from(subtypeModelFile).map((f, i) => (
                        <div key={i} className="ml-5 truncate text-blue-500">
                          {f.name} ({(f.size / 1024).toFixed(0)} KB)
                        </div>
                      ))}
                    </div>
                  )}
                  {!subtypeModelFile && subtypeForm.model_3d_path && (
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      <span>✅</span>
                      <span className="truncate">Modelo atual: {subtypeForm.model_3d_path}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Tecidos associados a esta peca</Label>
                  {materials.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      Nenhum tecido cadastrado. Crie tecidos na aba Tecidos &amp; Estamparia.
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-md border px-3 py-2">
                      {materials.filter((m) => m.is_active).map((material) => (
                        <label key={material.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selectedSubtypeMaterialIds.includes(material.id)}
                            onCheckedChange={(checked) =>
                              setSelectedSubtypeMaterialIds((prev) =>
                                checked
                                  ? prev.includes(material.id) ? prev : [...prev, material.id]
                                  : prev.filter((id) => id !== material.id)
                              )
                            }
                          />
                          <span>{material.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch
                    checked={subtypeForm.is_active}
                    onCheckedChange={(value) => setSubtypeForm((prev) => ({ ...prev, is_active: value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={loading}>
                    {subtypeForm.id ? "Atualizar" : "Salvar"}
                  </Button>
                  {subtypeForm.id && (
                    <Button type="button" variant="ghost" onClick={resetSubtypeForm}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>

              <div className="space-y-3">
                <div className="glass rounded-xl border p-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Preview 3D e marcação de zonas no painel da lista de subtipos.
                  </p>
                  <DecalZoneEditor
                    modelPath={subtypeForm.model_3d_path}
                    localModelFile={subtypeModelFile}
                    zones={subtypeDecalZones}
                    onChange={setSubtypeDecalZones}
                  />
                </div>
                {subtypes.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    Nenhum subtipo cadastrado.
                  </div>
                ) : (
                  subtypes.map((subtype) => (
                    <div
                      key={subtype.id}
                      className={cn(
                        "glass rounded-xl border px-4 py-3 flex items-center justify-between gap-3",
                        !subtype.is_active && "opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {subtype.card_image_path && (
                          <img
                            src={getPublicUrl(subtype.card_image_path) ?? undefined}
                            alt={subtype.name}
                            className="h-12 w-12 rounded-lg object-cover border"
                          />
                        )}
                        <div>
                          <div className="text-sm font-semibold flex items-center gap-1.5">
                            {subtype.name}
                            {(subtype as any).model_3d_path && (
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700" title={(subtype as any).model_3d_path}>
                                3D
                              </span>
                            )}
                            {Array.isArray((subtype as any).decal_zones_json) && (subtype as any).decal_zones_json.length > 0 && (
                              <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                                {((subtype as any).decal_zones_json as unknown[]).length} zona(s)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {typeById.get(subtype.type_id)?.name || "Sem tipo"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Area util: {subtype.print_area_width_cm ?? "-"} x {subtype.print_area_height_cm ?? "-"} cm
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {(() => {
                              const ids = subtypeMaterialIdsBySubtypeId.get(subtype.id) ?? [];
                              if (ids.length === 0) return "Nenhum tecido";
                              return "Tecidos: " + ids.map((id) => materialById.get(id)?.name).filter(Boolean).join(", ");
                            })()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSubtypeForm({
                              id: subtype.id,
                              type_id: subtype.type_id,
                              name: subtype.name,
                              slug: subtype.slug,
                              description: subtype.description || "",
                              sort_order: String(subtype.sort_order ?? 0),
                              is_active: subtype.is_active,
                              card_image_path: subtype.card_image_path || "",
                              model_3d_path: (subtype as any).model_3d_path || "",
                              print_area_width_cm: String(subtype.print_area_width_cm ?? ""),
                              print_area_height_cm: String(subtype.print_area_height_cm ?? ""),
                              min_decal_area_cm2: String(subtype.min_decal_area_cm2 ?? 5),
                              neck_zone_y_min: String(subtype.neck_zone_y_min ?? 0.82),
                              underarm_zone_y_min: String(subtype.underarm_zone_y_min ?? 0.45),
                              underarm_zone_y_max: String(subtype.underarm_zone_y_max ?? 0.72),
                              underarm_zone_abs_x_min: String(subtype.underarm_zone_abs_x_min ?? 0.55),
                            });
                            setSubtypeDecalZones(parseDecalZones((subtype as any).decal_zones_json));
                            setSelectedSubtypeMaterialIds(subtypeMaterialIdsBySubtypeId.get(subtype.id) ?? []);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteSubtype(subtype.id, subtype.name)}
                          disabled={loading}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="materials" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              {/* Formulario de tecido */}
              <form onSubmit={handleSaveMaterial} className="glass rounded-2xl border p-5 space-y-4 self-start">
                <div>
                  <h2 className="text-lg font-semibold">{materialForm.id ? "Editar tecido" : "Novo tecido"}</h2>
                  <p className="text-xs text-muted-foreground">Adicione o tecido; configure as estamparias na matriz ao lado.</p>
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={materialForm.name}
                    onChange={(e) => setMaterialForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Algodao"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descricao</Label>
                  <Textarea
                    value={materialForm.description}
                    onChange={(e) => setMaterialForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch
                    checked={materialForm.is_active}
                    onCheckedChange={(value) => setMaterialForm((prev) => ({ ...prev, is_active: value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={loading}>
                    {materialForm.id ? "Atualizar" : "Salvar"}
                  </Button>
                  {materialForm.id && (
                    <Button type="button" variant="ghost" onClick={resetMaterialForm}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>

              {/* Matriz tecidos × estamparia */}
              <div className="glass rounded-2xl border overflow-auto">
                {materials.length === 0 || printingMethods.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-muted-foreground">
                    {materials.length === 0
                      ? "Nenhum tecido cadastrado. Adicione um tecido ao lado."
                      : "Nenhum metodo de estamparia encontrado. Execute o SQL de seed."}
                  </div>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-widest text-muted-foreground min-w-[140px]">
                          Tecido
                        </th>
                        {printingMethods.map((method) => (
                          <th
                            key={method.id}
                            className="px-3 py-3 text-center font-medium text-xs max-w-[90px]"
                            title={method.description || method.name}
                          >
                            <span className="block leading-tight">{method.name.split(" ")[0]}</span>
                          </th>
                        ))}
                        <th className="px-3 py-3 w-[60px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((material) => {
                        const enabledIds = new Set(materialPrintingMethodIds.get(material.id) ?? []);
                        return (
                          <tr
                            key={material.id}
                            className={cn(
                              "border-b transition-colors hover:bg-muted/20",
                              materialForm.id === material.id && "bg-muted/30",
                              !material.is_active && "opacity-50"
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium">{material.name}</div>
                              {material.description && (
                                <div className="text-xs text-muted-foreground truncate max-w-[120px]">{material.description}</div>
                              )}
                            </td>
                            {printingMethods.map((method) => (
                              <td key={method.id} className="px-3 py-3 text-center">
                                <Checkbox
                                  checked={enabledIds.has(method.id)}
                                  disabled={loading}
                                  onCheckedChange={(checked) =>
                                    handleToggleMaterialPrintingMethod(
                                      material.id,
                                      method.id,
                                      checked === true
                                    )
                                  }
                                  aria-label={`${material.name} aceita ${method.name}`}
                                />
                              </td>
                            ))}
                            <td className="px-3 py-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setMaterialForm({
                                    id: material.id,
                                    name: material.name,
                                    description: material.description || "",
                                    is_active: material.is_active,
                                  })
                                }
                              >
                                Editar
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="suppliers" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <form onSubmit={handleSaveSupplier} className="glass rounded-2xl border p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Novo fornecedor</h2>
                  <p className="text-xs text-muted-foreground">Fornecedores de materiais e pecas.</p>
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Fornecedor ABC"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="contato@fornecedor.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="(11) 99999-0000"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch
                    checked={supplierForm.is_active}
                    onCheckedChange={(value) => setSupplierForm((prev) => ({ ...prev, is_active: value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={loading}>
                    {supplierForm.id ? "Atualizar" : "Salvar"}
                  </Button>
                  {supplierForm.id && (
                    <Button type="button" variant="ghost" onClick={resetSupplierForm}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>

              <div className="space-y-3">
                {suppliers.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    Nenhum fornecedor cadastrado.
                  </div>
                ) : (
                  suppliers.map((supplier) => (
                    <div
                      key={supplier.id}
                      className={cn(
                        "glass rounded-xl border px-4 py-3 flex items-center justify-between gap-3",
                        !supplier.is_active && "opacity-60"
                      )}
                    >
                      <div>
                        <div className="text-sm font-semibold">{supplier.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {supplier.email || supplier.phone || "Sem contato"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSupplierForm({
                            id: supplier.id,
                            name: supplier.name,
                            email: supplier.email || "",
                            phone: supplier.phone || "",
                            is_active: supplier.is_active,
                          })
                        }
                      >
                        Editar
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="products" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <form onSubmit={handleSaveProduct} className="glass rounded-2xl border p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Novo produto</h2>
                  <p className="text-xs text-muted-foreground">Item vendavel exibido no catalogo.</p>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select
                    value={productForm.type_id}
                    onChange={(e) =>
                      setProductForm((prev) => ({ ...prev, type_id: e.target.value, subtype_id: "" }))
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {types.map((typeItem) => (
                      <option key={typeItem.id} value={typeItem.id}>
                        {typeItem.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Subtipo (opcional)</Label>
                  <select
                    value={productForm.subtype_id}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, subtype_id: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Nenhum</option>
                    {activeSubtypesForType.map((subtype) => (
                      <option key={subtype.id} value={subtype.id}>
                        {subtype.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Tecido (obrigatorio)</Label>
                  <select
                    value={productForm.material_id}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, material_id: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {materials
                      .filter((material) => material.is_active)
                      .map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input
                    value={productForm.sku}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, sku: e.target.value }))}
                    placeholder="SKU-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={productForm.name}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Camiseta Masculina"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descricao</Label>
                  <Textarea
                    value={productForm.description}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cores disponiveis (HEX)</Label>
                  <Textarea
                    value={productForm.available_colors_text}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, available_colors_text: e.target.value }))}
                    placeholder="#ffffff, #111827, #ef4444"
                  />
                  <p className="text-xs text-muted-foreground">Use cores no formato #RRGGBB separadas por virgula, ponto e virgula ou quebra de linha.</p>
                </div>
                <div className="space-y-2">
                  <Label>Imagem de capa</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setProductImageFile(e.target.files?.[0] || null)} />
                  {productImagePreview && (
                    <img src={productImagePreview} alt="Preview" className="h-28 w-full rounded-lg object-cover" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Label>Disponivel</Label>
                  <Switch
                    checked={productForm.available}
                    onCheckedChange={(value) => setProductForm((prev) => ({ ...prev, available: value }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Visivel</Label>
                  <Switch
                    checked={productForm.visible}
                    onCheckedChange={(value) => setProductForm((prev) => ({ ...prev, visible: value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={loading}>
                    {productForm.id ? "Atualizar" : "Salvar"}
                  </Button>
                  {productForm.id && (
                    <Button type="button" variant="ghost" onClick={resetProductForm}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>

              <div className="space-y-3">
                {products.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    Nenhum produto cadastrado.
                  </div>
                ) : (
                  products.map((product) => (
                    <div
                      key={product.id}
                      className={cn(
                        "glass rounded-xl border px-4 py-3 flex items-center justify-between gap-3",
                        !product.visible && "opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {product.cover_image_path && (
                          <img
                            src={getPublicUrl(product.cover_image_path) ?? undefined}
                            alt={product.name}
                            className="h-12 w-12 rounded-lg object-cover border"
                          />
                        )}
                        <div>
                          <div className="text-sm font-semibold">{product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {typeById.get(product.type_id)?.name || "Sem tipo"}
                            {" • "}
                            {materialById.get(productMaterialByProductId.get(product.id)?.material_id || "")?.name ||
                              "Sem tecido"}
                          </div>
                          {Array.isArray(product.available_colors) && product.available_colors.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {product.available_colors.slice(0, 6).map((color) => (
                                <span
                                  key={`${product.id}-${color}`}
                                  className="h-4 w-4 rounded-full border"
                                  style={{ backgroundColor: color }}
                                  title={color}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setProductForm({
                            id: product.id,
                            type_id: product.type_id,
                            subtype_id: product.subtype_id || "",
                            material_id: productMaterialByProductId.get(product.id)?.material_id || "",
                            sku: product.sku,
                            name: product.name,
                            description: product.description || "",
                            available_colors_text: Array.isArray(product.available_colors) ? product.available_colors.join(", ") : "",
                            available: product.available,
                            visible: product.visible,
                            cover_image_path: product.cover_image_path || "",
                          })
                        }
                      >
                        Editar
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="inventory" className="mt-6">
            <div className="space-y-3">
              {products.length === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  Cadastre produtos para controlar o estoque.
                </div>
              ) : (
                products.map((product) => {
                  const edit = inventoryEdits[product.id] || { on_hand: 0, reserved: 0 };
                  return (
                    <div key={product.id} className="glass rounded-xl border px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold">{product.name}</div>
                          <div className="text-xs text-muted-foreground">{product.sku}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Disponivel</Label>
                            <Input
                              type="number"
                              min={0}
                              value={edit.on_hand}
                              onChange={(e) =>
                                setInventoryEdits((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...edit,
                                    on_hand: toNumber(e.target.value),
                                  },
                                }))
                              }
                              className="w-24"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Reservado</Label>
                            <Input
                              type="number"
                              min={0}
                              value={edit.reserved}
                              onChange={(e) =>
                                setInventoryEdits((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...edit,
                                    reserved: toNumber(e.target.value),
                                  },
                                }))
                              }
                              className="w-24"
                            />
                          </div>
                          <Button size="sm" onClick={() => handleSaveInventory(product.id)}>
                            Salvar
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
