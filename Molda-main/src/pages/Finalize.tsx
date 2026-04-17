import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Canvas3DViewer from "@/components/Canvas3DViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, MapPin, PackageCheck, Save, Search, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getModelConfigFromSelection } from "@/lib/models";
import type { ExternalDecalData } from "@/types/decals";
import { toast } from "sonner";

type ProjectData = {
  projectName?: string;
  part?: string | null;
  type?: string | null;
  subtype?: string | null;
  baseColor?: string;
  size?: string;
  fabric?: string;
  notes?: string;
  canvasSnapshots?: Record<string, string>;
  canvasTabs?: Array<{ id: string; name: string; type: "2d" | "3d" }>;
  tabVisibility?: Record<string, boolean>;
  tabDecalPreviews?: Record<string, string>;
  tabDecalPlacements?: Record<string, ExternalDecalData["transform"]>;
  tabPrintTypes?: Record<string, string>;
};

type DeliveryType = "standard" | "express" | "economy";

type AddressForm = {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
};

type SavedAddressRow = {
  id: string;
  user_id: string;
  postal_code: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  is_default: boolean;
  created_at: string;
};

const DELIVERY_PRICE: Record<DeliveryType, number> = {
  standard: 18,
  express: 32,
  economy: 12,
};

const BASE_PRICE = 89.9;

const EMPTY_ADDRESS: AddressForm = {
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  postalCode: "",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const normalizeFabricLabel = (value?: string | null) => {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("algod")) return "100% Algodão";
  if (raw.includes("poli")) return "Poliéster";
  if (raw.includes("misto")) return "Misto";
  if (raw.includes("linho")) return "Linho";
  return value || "Não informado";
};

const normalizePostalCode = (value: string) => value.replace(/\D/g, "").slice(0, 8);

const formatPostalCode = (value: string) => {
  const digits = normalizePostalCode(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const isAddressComplete = (address: AddressForm) =>
  Boolean(address.street && address.number && address.district && address.city && address.state && normalizePostalCode(address.postalCode).length === 8);

const rowToAddress = (row: SavedAddressRow): AddressForm => ({
  street: row.street || "",
  number: row.number || "",
  complement: row.complement || "",
  district: row.district || "",
  city: row.city || "",
  state: String(row.state || "").toUpperCase(),
  postalCode: formatPostalCode(row.postal_code || ""),
});

const Finalize = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("standard");
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressRow[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [searchingPostalCode, setSearchingPostalCode] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem("currentProject");
    if (data) {
      setProjectData(JSON.parse(data));
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setSavedAddresses([]);
      setSelectedAddressId(null);
      setShowAddressForm(true);
      setAddress(EMPTY_ADDRESS);
      return;
    }

    let cancelled = false;

    const fetchAddresses = async () => {
      setLoadingAddresses(true);

      const { data, error } = await supabase
        .from("profile_addresses")
        .select("id, user_id, postal_code, street, number, complement, district, city, state, is_default, created_at")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (cancelled) return;

      setLoadingAddresses(false);

      if (error) {
        console.error("[profile_addresses fetch]", error);
        const isMissingTable = String(error.code) === "42P01" || String(error.message ?? "").includes("does not exist");
        if (isMissingTable) {
          // Tabela ainda não criada no Supabase — tratar como sem endereços cadastrados
          setSavedAddresses([]);
          setSelectedAddressId(null);
          setShowAddressForm(true);
          setAddress(EMPTY_ADDRESS);
          return;
        }
        toast.error("Não foi possível carregar seus endereços.");
        setSavedAddresses([]);
        setSelectedAddressId(null);
        setShowAddressForm(true);
        setAddress(EMPTY_ADDRESS);
        return;
      }

      const rows = (data ?? []) as SavedAddressRow[];
      setSavedAddresses(rows);

      if (rows.length === 0) {
        setSelectedAddressId(null);
        setShowAddressForm(true);
        setAddress(EMPTY_ADDRESS);
        return;
      }

      const defaultRow = rows.find((row) => row.is_default) ?? rows[0];
      setSelectedAddressId(defaultRow.id);
      setAddress(rowToAddress(defaultRow));
      setShowAddressForm(false);
    };

    fetchAddresses();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const unitPrice = BASE_PRICE;
  const shippingCost = DELIVERY_PRICE[deliveryType];
  const totalCost = useMemo(() => unitPrice * quantity + shippingCost, [quantity, shippingCost]);

  const visibleDecalAssets = useMemo(() => {
    if (!projectData) return [] as string[];
    const previews = projectData.tabDecalPreviews ?? {};
    const visibility = projectData.tabVisibility ?? {};
    const tabs = projectData.canvasTabs ?? [];

    const listed = tabs
      .filter((tab) => tab.type === "2d" && visibility[tab.id] !== false && previews[tab.id])
      .map((tab) => previews[tab.id]);

    if (listed.length > 0) return listed;
    return Object.values(previews).filter((item): item is string => Boolean(item));
  }, [projectData]);

  const decalsFor3D = useMemo<ExternalDecalData[]>(() => {
    if (!projectData) return [];

    const previews = projectData.tabDecalPreviews ?? {};
    const visibility = projectData.tabVisibility ?? {};
    const tabs = projectData.canvasTabs ?? [];
    const placements = projectData.tabDecalPlacements ?? {};

    const fromTabs = tabs
      .filter((tab) => tab.type === "2d" && visibility[tab.id] !== false && previews[tab.id])
      .map((tab) => ({
        id: tab.id,
        label: tab.name,
        dataUrl: previews[tab.id] as string,
        transform: placements[tab.id] ?? null,
      }));

    if (fromTabs.length > 0) return fromTabs;

    return Object.entries(previews)
      .filter(([, dataUrl]) => Boolean(dataUrl))
      .map(([id, dataUrl]) => ({
        id,
        label: id,
        dataUrl: dataUrl as string,
        transform: placements[id] ?? null,
      }));
  }, [projectData]);

  const handleSaveCreation = () => {
    navigate("/profile");
  };

  const handleSaveDraft = () => {
    navigate("/profile");
  };

  const handleAddressLookupByPostalCode = async () => {
    const postalCode = normalizePostalCode(address.postalCode);
    if (postalCode.length !== 8) {
      toast.error("Digite um CEP válido com 8 números.");
      return;
    }

    setSearchingPostalCode(true);

    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      const payload = await response.json();

      if (!response.ok || payload?.erro) {
        toast.error("CEP não encontrado.");
        return;
      }

      setAddress((prev) => ({
        ...prev,
        street: payload.logradouro || prev.street,
        district: payload.bairro || prev.district,
        city: payload.localidade || prev.city,
        state: String(payload.uf || prev.state || "").toUpperCase(),
        postalCode: formatPostalCode(postalCode),
      }));

      toast.success("CEP encontrado. Agora preencha número e complemento.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível consultar o CEP agora.");
    } finally {
      setSearchingPostalCode(false);
    }
  };

  const handleSelectSavedAddress = (id: string) => {
    setSelectedAddressId(id);
    const row = savedAddresses.find((item) => item.id === id);
    if (row) {
      setAddress(rowToAddress(row));
      setShowAddressForm(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!user?.id) {
      navigate("/login", { state: { from: "/finalize" } });
      return;
    }

    if (!isAddressComplete(address)) {
      toast.error("Preencha os dados obrigatórios do endereço.");
      return;
    }

    setSavingAddress(true);

    const { data, error } = await supabase
      .from("profile_addresses")
      .insert({
        user_id: user.id,
        postal_code: normalizePostalCode(address.postalCode),
        street: address.street.trim(),
        number: address.number.trim(),
        complement: address.complement.trim() || null,
        district: address.district.trim(),
        city: address.city.trim(),
        state: address.state.trim().toUpperCase(),
        is_default: savedAddresses.length === 0,
      })
      .select("id, user_id, postal_code, street, number, complement, district, city, state, is_default, created_at")
      .single();

    setSavingAddress(false);

    if (error) {
      console.error("[profile_addresses insert]", error);
      const isMissingTable = String(error.code) === "42P01" || String(error.message ?? "").includes("does not exist");
      if (isMissingTable) {
        toast.error("Execute a migration 05_create_profile_addresses.sql no Supabase para ativar endereços.");
      } else {
        toast.error(`Não foi possível salvar o endereço. (${String(error.code ?? error.message)})`);
      }
      return;
    }

    const inserted = data as SavedAddressRow;
    const nextAddresses = [inserted, ...savedAddresses];

    setSavedAddresses(nextAddresses);
    setSelectedAddressId(inserted.id);
    setAddress(rowToAddress(inserted));
    setShowAddressForm(false);
    toast.success("Endereço salvo com sucesso.");
  };

  const handleSendToProduction = async () => {
    if (!projectData) return;
    if (!user?.id) {
      navigate("/login", { state: { from: "/finalize" } });
      return;
    }

    if (showAddressForm) {
      toast.error("Salve um endereço antes de enviar para produção.");
      return;
    }

    if (!isAddressComplete(address)) {
      toast.error("Preencha os dados de entrega antes de enviar para produção.");
      return;
    }

    setSubmitting(true);

    const modelConfig = getModelConfigFromSelection({
      part: projectData.part,
      type: projectData.type,
      subtype: projectData.subtype,
    });

    const designPreviewUrl =
      Object.values(projectData.canvasSnapshots ?? {}).find((item) => Boolean(item)) ??
      visibleDecalAssets[0] ??
      null;

    const orderPayload: Record<string, unknown> = {
      user_id: user.id,
      status: "pending",
      design_3d_model_path: modelConfig.src ?? null,
      design_preview_url: designPreviewUrl,
      design_specifications: {
        part: projectData.part ?? null,
        type: projectData.type ?? null,
        subtype: projectData.subtype ?? null,
        size: projectData.size ?? null,
        fabric: projectData.fabric ?? null,
      },
      material_quantity: quantity,
      material_unit: "un",
      decals_paths: visibleDecalAssets,
      colors: { base: projectData.baseColor ?? null },
      inscriptions: projectData.notes ?? null,
      custom_metadata: {
        project_name: projectData.projectName ?? null,
        canvas_tabs: projectData.canvasTabs ?? [],
        print_types: projectData.tabPrintTypes ?? {},
      },
      unit_price: unitPrice,
      quantity,
      material_cost: Number((quantity * 12).toFixed(2)),
      production_cost: Number((quantity * 20).toFixed(2)),
      total_cost: Number(totalCost.toFixed(2)),
      delivery_type: deliveryType,
      shipping_cost: shippingCost,
      shipping_address_street: address.street,
      shipping_address_number: address.number,
      shipping_address_complement: address.complement || null,
      shipping_address_district: address.district,
      shipping_address_city: address.city,
      shipping_address_state: address.state,
      shipping_address_postal_code: normalizePostalCode(address.postalCode),
    };

    const { data, error } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id, order_number")
      .single();

    setSubmitting(false);

    if (error) {
      console.error(error);
      const isOrderNumberFormatError = String(error.code) === "22023" && String(error.message ?? "").includes("format()");
      if (isOrderNumberFormatError) {
        toast.error("O banco precisa da correção da função de número do pedido (execute 06_fix_assign_order_number_format.sql).");
      } else {
        toast.error(`Não foi possível criar o pedido. (${String(error.code ?? error.message)})`);
      }
      return;
    }

    localStorage.removeItem("currentProject");
    toast.success(`Pedido ${data.order_number} enviado para produção.`);
    navigate("/profile");
  };

  if (!projectData) {
    return (
      <div className="min-h-screen ">
        <Header />
        <div className="pt-24 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 text-center">
          <p className="text-gray-600">Nenhum projeto encontrado.</p>
          <Button onClick={() => navigate("/create")} className="mt-4">
            Criar Novo Projeto
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="outline" onClick={() => navigate("/creation")} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar para Edição
            </Button>

            <div>
              <h1 className="text-3xl font-bold text-gray-800">Finalizar pedido</h1>
              <p className="text-gray-600">Revise a peça, preencha a entrega e envie o pedido para a produção.</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Resumo da peça</span>
                  <Badge variant="secondary">
                    {projectData.part} - {projectData.type}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full h-80 rounded-lg overflow-hidden border shadow-inner bg-muted/20">
                  <Canvas3DViewer
                    className="h-full w-full"
                    baseColor={projectData.baseColor ?? "#ffffff"}
                    selectionOverride={{
                      part: projectData.part ?? null,
                      type: projectData.type ?? null,
                      subtype: projectData.subtype ?? null,
                    }}
                    externalDecals={decalsFor3D}
                    interactive={false}
                  />
                </div>

                <div className="mt-4 grid gap-3 rounded-xl border p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Preço unitário</span>
                    <span className="font-medium">{formatCurrency(unitPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Frete</span>
                    <span className="font-medium">{formatCurrency(shippingCost)}</span>
                  </div>
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(totalCost)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Especificações e entrega</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Nome do Projeto</Label>
                    <p className="text-gray-800 font-medium">{projectData.projectName || "Sem nome"}</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-600">Tipo</Label>
                    <p className="text-gray-800 font-medium">
                      {projectData.type} - {projectData.subtype}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-600">Cor Base</Label>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full border-2 border-gray-300" style={{ backgroundColor: projectData.baseColor }} />
                      <span className="text-gray-800 font-medium">{projectData.baseColor}</span>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-600">Tamanho</Label>
                    <p className="text-gray-800 font-medium">{projectData.size}</p>
                  </div>

                  <div className="col-span-2">
                    <Label className="text-sm font-medium text-gray-600">Tecido</Label>
                    <p className="text-gray-800 font-medium">{normalizeFabricLabel(projectData.fabric)}</p>
                  </div>
                </div>

                <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Quantidade</Label>
                    <Input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Entrega</Label>
                    <Select value={deliveryType} onValueChange={(value) => setDeliveryType(value as DeliveryType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="economy">Econômica</SelectItem>
                        <SelectItem value="standard">Padrão</SelectItem>
                        <SelectItem value="express">Expressa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-2 rounded-xl border p-4 bg-muted/20 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold">Endereço de entrega</h3>
                      </div>
                    </div>

                    {loadingAddresses ? (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando endereços...
                      </div>
                    ) : (
                      <Tabs value={showAddressForm ? "new" : "saved"} onValueChange={(value) => setShowAddressForm(value === "new")}> 
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="saved" disabled={savedAddresses.length === 0}>Endereço sugerido</TabsTrigger>
                          <TabsTrigger value="new">Cadastrar endereço</TabsTrigger>
                        </TabsList>

                        <TabsContent value="saved" className="space-y-3">
                          {savedAddresses.length > 0 ? (
                            <div className="space-y-2">
                              <Label>Selecionar endereço salvo</Label>
                              <Select value={selectedAddressId ?? savedAddresses[0].id} onValueChange={handleSelectSavedAddress}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Escolha um endereço" />
                                </SelectTrigger>
                                <SelectContent>
                                  {savedAddresses.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.street}, {item.number} - {item.city}/{item.state}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Você ainda não possui endereço salvo. Use a aba Cadastrar endereço.</p>
                          )}
                        </TabsContent>

                        <TabsContent value="new" className="space-y-3">
                          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                            <div className="space-y-2">
                              <Label>CEP</Label>
                              <Input
                                value={formatPostalCode(address.postalCode)}
                                onChange={(event) =>
                                  setAddress((prev) => ({
                                    ...prev,
                                    postalCode: formatPostalCode(event.target.value),
                                  }))
                                }
                                placeholder="00000-000"
                              />
                            </div>
                            <Button type="button" variant="outline" onClick={handleAddressLookupByPostalCode} disabled={searchingPostalCode} className="gap-2">
                              {searchingPostalCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                              Buscar CEP
                            </Button>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Rua</Label>
                              <Input value={address.street} onChange={(event) => setAddress((prev) => ({ ...prev, street: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Número</Label>
                              <Input value={address.number} onChange={(event) => setAddress((prev) => ({ ...prev, number: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Complemento</Label>
                              <Input value={address.complement} onChange={(event) => setAddress((prev) => ({ ...prev, complement: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Bairro</Label>
                              <Input value={address.district} onChange={(event) => setAddress((prev) => ({ ...prev, district: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Cidade</Label>
                              <Input value={address.city} onChange={(event) => setAddress((prev) => ({ ...prev, city: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Estado</Label>
                              <Input
                                value={address.state}
                                onChange={(event) =>
                                  setAddress((prev) => ({
                                    ...prev,
                                    state: event.target.value.toUpperCase().slice(0, 2),
                                  }))
                                }
                                maxLength={2}
                              />
                            </div>
                          </div>

                          <Button type="button" onClick={handleSaveAddress} disabled={savingAddress} className="w-full sm:w-auto">
                            {savingAddress ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Salvar endereço
                          </Button>
                        </TabsContent>
                      </Tabs>
                    )}
                  </div>
                </div>

                {visibleDecalAssets.length > 0 ? (
                  <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                    <div className="flex items-center gap-2 font-medium text-gray-800">
                      <PackageCheck className="h-4 w-4" />
                      Arquivos prontos para produção
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {visibleDecalAssets.length} decal(s) serão anexados ao pedido para a fábrica baixar depois.
                    </p>
                  </div>
                ) : null}

                <div className="pt-6 space-y-3">
                  <Button
                    onClick={handleSendToProduction}
                    disabled={submitting || loadingAddresses || showAddressForm}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium py-3 text-lg"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                    Enviar para Produção
                  </Button>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleSaveCreation}
                      variant="outline"
                      className="py-3 font-medium border-purple-300 text-purple-700 hover:bg-purple-50"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Criação
                    </Button>

                    <Button onClick={handleSaveDraft} variant="outline" className="py-3 font-medium">
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Rascunho
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Finalize;
