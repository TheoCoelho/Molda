import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, PackageCheck, Save, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getModelConfigFromSelection } from "@/lib/models";
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
  tabPrintTypes?: Record<string, string>;
};

type DeliveryType = "standard" | "express" | "economy";

const DELIVERY_PRICE: Record<DeliveryType, number> = {
  standard: 18,
  express: 32,
  economy: 12,
};

const BASE_PRICE = 89.9;

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

const Finalize = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("standard");
  const [address, setAddress] = useState({
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem("currentProject");
    if (data) {
      setProjectData(JSON.parse(data));
    }
  }, []);

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

  const handleSaveCreation = () => {
    navigate("/profile");
  };

  const handleSaveDraft = () => {
    navigate("/profile");
  };

  const handleSendToProduction = async () => {
    if (!projectData) return;
    if (!user?.id) {
      navigate("/login", { state: { from: "/finalize" } });
      return;
    }

    if (!address.street || !address.number || !address.district || !address.city || !address.state || !address.postalCode) {
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
      shipping_address_postal_code: address.postalCode,
    };

    const { data, error } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id, order_number")
      .single();

    setSubmitting(false);

    if (error) {
      console.error(error);
      toast.error("Não foi possível criar o pedido.");
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
          {/* Cabeçalho */}
          <div className="flex items-center gap-4 mb-8">
            <Button
              variant="outline"
              onClick={() => navigate('/creation')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para Edição
            </Button>
            
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Finalizar pedido
              </h1>
              <p className="text-gray-600">
                Revise a peça, preencha a entrega e envie o pedido para a produção.
              </p>
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
                <div 
                  className="w-full h-80 rounded-lg flex items-center justify-center text-white font-medium text-lg shadow-inner"
                  style={{ backgroundColor: projectData.baseColor }}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">{projectData.type}</div>
                    <div className="text-lg opacity-90">{projectData.subtype}</div>
                    <div className="text-sm opacity-75 mt-2">
                      {projectData.projectName || "Minha Criação"}
                    </div>
                  </div>
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
                    <p className="text-gray-800 font-medium">
                      {projectData.projectName || "Sem nome"}
                    </p>
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
                      <div
                        className="w-6 h-6 rounded-full border-2 border-gray-300"
                        style={{ backgroundColor: projectData.baseColor }}
                      />
                      <span className="text-gray-800 font-medium">
                        {projectData.baseColor}
                      </span>
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
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Entrega</Label>
                    <Select value={deliveryType} onValueChange={(value) => setDeliveryType(value as DeliveryType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="economy">Econômica</SelectItem>
                        <SelectItem value="standard">Padrão</SelectItem>
                        <SelectItem value="express">Expressa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                    <Input value={address.state} onChange={(event) => setAddress((prev) => ({ ...prev, state: event.target.value }))} maxLength={2} />
                  </div>
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input value={address.postalCode} onChange={(event) => setAddress((prev) => ({ ...prev, postalCode: event.target.value }))} />
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
                    disabled={submitting}
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
                    
                    <Button
                      onClick={handleSaveDraft}
                      variant="outline"
                      className="py-3 font-medium"
                    >
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
