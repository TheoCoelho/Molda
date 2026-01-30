
import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/constants/storage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const Admin = () => {
  const [loading, setLoading] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [types, setTypes] = useState<ProductType[]>([]);
  const [subtypes, setSubtypes] = useState<ProductSubtype[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [partForm, setPartForm] = useState({
    id: "",
    name: "",
    slug: "",
    description: "",
    sort_order: "0",
    is_active: true,
  });

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
  });
  const [subtypeImageFile, setSubtypeImageFile] = useState<File | null>(null);
  const [subtypeImagePreview, setSubtypeImagePreview] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({
    id: "",
    type_id: "",
    subtype_id: "",
    sku: "",
    name: "",
    description: "",
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
      const [partsRes, typesRes, subtypesRes, productsRes, inventoryRes, materialsRes, suppliersRes] = await Promise.all([
        supabase.from("parts").select("*").order("sort_order", { ascending: true }),
        supabase.from("product_types").select("*").order("sort_order", { ascending: true }),
        supabase.from("product_subtypes").select("*").order("sort_order", { ascending: true }),
        supabase.from("products").select("*").order("name", { ascending: true }),
        supabase.from("inventory").select("*"),
        supabase.from("materials").select("*").order("name", { ascending: true }),
        supabase.from("suppliers").select("*").order("name", { ascending: true }),
      ]);

      if (partsRes.error) throw partsRes.error;
      if (typesRes.error) throw typesRes.error;
      if (subtypesRes.error) throw subtypesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (inventoryRes.error) throw inventoryRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      setParts((partsRes.data as Part[]) || []);
      setTypes((typesRes.data as ProductType[]) || []);
      setSubtypes((subtypesRes.data as ProductSubtype[]) || []);
      setProducts((productsRes.data as Product[]) || []);
      setInventory((inventoryRes.data as Inventory[]) || []);
      setMaterials((materialsRes.data as Material[]) || []);
      setSuppliers((suppliersRes.data as Supplier[]) || []);
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

  const resetPartForm = () =>
    setPartForm({ id: "", name: "", slug: "", description: "", sort_order: "0", is_active: true });

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
    });
    setSubtypeImageFile(null);
  };

  const resetProductForm = () => {
    setProductForm({
      id: "",
      type_id: "",
      subtype_id: "",
      sku: "",
      name: "",
      description: "",
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
  const handleSavePart = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: partForm.name.trim(),
      slug: (partForm.slug || partForm.name).trim() ? slugify(partForm.slug || partForm.name) : "",
      description: partForm.description.trim() || null,
      sort_order: toNumber(partForm.sort_order),
      is_active: partForm.is_active,
    };

    if (!payload.name || !payload.slug) {
      toast.error("Nome e slug sao obrigatorios.");
      return;
    }

    try {
      if (partForm.id) {
        const { error } = await supabase.from("parts").update(payload).eq("id", partForm.id);
        if (error) throw error;
        toast.success("Peca atualizada.");
      } else {
        const { error } = await supabase.from("parts").insert(payload);
        if (error) throw error;
        toast.success("Peca criada.");
      }
      resetPartForm();
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.savePart]", err);
      toast.error(err?.message || "Falha ao salvar peca.");
    }
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
    const payload = {
      type_id: subtypeForm.type_id,
      name: subtypeForm.name.trim(),
      slug: (subtypeForm.slug || subtypeForm.name).trim()
        ? slugify(subtypeForm.slug || subtypeForm.name)
        : "",
      description: subtypeForm.description.trim() || null,
      sort_order: toNumber(subtypeForm.sort_order),
      is_active: subtypeForm.is_active,
      card_image_path: subtypeForm.card_image_path || null,
    };

    if (!payload.type_id || !payload.name || !payload.slug) {
      toast.error("Tipo, nome e slug sao obrigatorios.");
      return;
    }

    try {
      if (subtypeImageFile) {
        payload.card_image_path = await uploadImage(subtypeImageFile, "subtypes");
      }
      if (subtypeForm.id) {
        const { error } = await supabase
          .from("product_subtypes")
          .update(payload)
          .eq("id", subtypeForm.id);
        if (error) throw error;
        toast.success("Subtipo atualizado.");
      } else {
        const { error } = await supabase.from("product_subtypes").insert(payload);
        if (error) throw error;
        toast.success("Subtipo criado.");
      }
      resetSubtypeForm();
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.saveSubtype]", err);
      toast.error(err?.message || "Falha ao salvar subtipo.");
    }
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      type_id: productForm.type_id,
      subtype_id: productForm.subtype_id || null,
      sku: productForm.sku.trim(),
      name: productForm.name.trim(),
      description: productForm.description.trim() || null,
      available: productForm.available,
      visible: productForm.visible,
      cover_image_path: productForm.cover_image_path || null,
    };

    if (!payload.type_id || !payload.sku || !payload.name) {
      toast.error("Tipo, SKU e nome sao obrigatorios.");
      return;
    }

    try {
      if (productImageFile) {
        payload.cover_image_path = await uploadImage(productImageFile, "products");
      }
      if (productForm.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", productForm.id);
        if (error) throw error;
        toast.success("Produto atualizado.");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("Produto criado.");
      }
      resetProductForm();
      await loadCatalog();
    } catch (err: any) {
      console.error("[admin.saveProduct]", err);
      toast.error(err?.message || "Falha ao salvar produto.");
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
        const { error } = await supabase.from("materials").update(payload).eq("id", materialForm.id);
        if (error) throw error;
        toast.success("Material atualizado.");
      } else {
        const { error } = await supabase.from("materials").insert(payload);
        if (error) throw error;
        toast.success("Material criado.");
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

  const activeSubtypesForType = useMemo(
    () => subtypes.filter((subtype) => subtype.type_id === productForm.type_id),
    [subtypes, productForm.type_id]
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="container mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin</p>
          <h1 className="text-3xl font-semibold">Catalogo e disponibilidade</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gerencie pecas, tipos, subtipos, produtos e estoque que abastecem os carrosseis do
            Create.
          </p>
        </div>

        <Tabs defaultValue="parts">
          <TabsList className="flex flex-wrap gap-2">
            <TabsTrigger value="parts">Pecas</TabsTrigger>
            <TabsTrigger value="types">Tipos</TabsTrigger>
            <TabsTrigger value="subtypes">Subtipos</TabsTrigger>
            <TabsTrigger value="materials">Materiais</TabsTrigger>
            <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="inventory">Estoque</TabsTrigger>
          </TabsList>

          <TabsContent value="parts" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <form onSubmit={handleSavePart} className="glass rounded-2xl border p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Nova peca</h2>
                  <p className="text-xs text-muted-foreground">
                    Ex: Cabeca, Tronco, Pernas.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={partForm.name}
                    onChange={(e) => setPartForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Cabeca"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    value={partForm.slug}
                    onChange={(e) => setPartForm((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="head"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descricao</Label>
                  <Textarea
                    value={partForm.description}
                    onChange={(e) => setPartForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Breve descricao da peca"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={partForm.sort_order}
                    onChange={(e) => setPartForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch
                    checked={partForm.is_active}
                    onCheckedChange={(value) => setPartForm((prev) => ({ ...prev, is_active: value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={loading}>
                    {partForm.id ? "Atualizar" : "Salvar"}
                  </Button>
                  {partForm.id && (
                    <Button type="button" variant="ghost" onClick={resetPartForm}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>

              <div className="space-y-3">
                {parts.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    Nenhuma peca cadastrada.
                  </div>
                ) : (
                  parts.map((part) => (
                    <div
                      key={part.id}
                      className={cn(
                        "glass rounded-xl border px-4 py-3 flex items-center justify-between gap-3",
                        !part.is_active && "opacity-60"
                      )}
                    >
                      <div>
                        <div className="text-sm font-semibold">{part.name}</div>
                        <div className="text-xs text-muted-foreground">{part.description || "Sem descricao"}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPartForm({
                            id: part.id,
                            name: part.name,
                            slug: part.slug,
                            description: part.description || "",
                            sort_order: String(part.sort_order ?? 0),
                            is_active: part.is_active,
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
                  <Label>Imagem do card</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setSubtypeImageFile(e.target.files?.[0] || null)} />
                  {subtypeImagePreview && (
                    <img src={subtypeImagePreview} alt="Preview" className="h-28 w-full rounded-lg object-cover" />
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
                          <div className="text-sm font-semibold">{subtype.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {typeById.get(subtype.type_id)?.name || "Sem tipo"}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSubtypeForm({
                            id: subtype.id,
                            type_id: subtype.type_id,
                            name: subtype.name,
                            slug: subtype.slug,
                            description: subtype.description || "",
                            sort_order: String(subtype.sort_order ?? 0),
                            is_active: subtype.is_active,
                            card_image_path: subtype.card_image_path || "",
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
          <TabsContent value="materials" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <form onSubmit={handleSaveMaterial} className="glass rounded-2xl border p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Novo material</h2>
                  <p className="text-xs text-muted-foreground">Materiais usados nos produtos.</p>
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

              <div className="space-y-3">
                {materials.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    Nenhum material cadastrado.
                  </div>
                ) : (
                  materials.map((material) => (
                    <div
                      key={material.id}
                      className={cn(
                        "glass rounded-xl border px-4 py-3 flex items-center justify-between gap-3",
                        !material.is_active && "opacity-60"
                      )}
                    >
                      <div>
                        <div className="text-sm font-semibold">{material.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {material.description || "Sem descricao"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
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
                    </div>
                  ))
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
                          </div>
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
                            sku: product.sku,
                            name: product.name,
                            description: product.description || "",
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
