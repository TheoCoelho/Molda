import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Box, Download, Loader2, PackageCheck, Search, Shirt, Truck } from "lucide-react";
import { toast } from "sonner";

type OrderStatus =
  | "pending"
  | "approved"
  | "production"
  | "quality_check"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "cancelled";

type FactoryOrder = {
  id: string;
  order_number: string;
  user_id: string;
  factory_user_id?: string | null;
  status: OrderStatus;
  design_3d_model_path?: string | null;
  design_preview_url?: string | null;
  design_specifications?: Record<string, unknown> | null;
  decals_paths?: unknown;
  colors?: Record<string, unknown> | null;
  inscriptions?: string | null;
  quantity: number;
  unit_price: number;
  total_cost: number;
  delivery_type: string;
  shipping_cost?: number | null;
  shipping_address_street?: string | null;
  shipping_address_number?: string | null;
  shipping_address_complement?: string | null;
  shipping_address_district?: string | null;
  shipping_address_city?: string | null;
  shipping_address_state?: string | null;
  shipping_address_postal_code?: string | null;
  tracking_number?: string | null;
  quality_check_notes?: string | null;
  custom_metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type OrderEvent = {
  id: string;
  event_type: string;
  notes?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  production: "Em produção",
  quality_check: "Qualidade",
  ready_to_ship: "Pronto envio",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  approved: "bg-sky-100 text-sky-900 border-sky-300",
  production: "bg-indigo-100 text-indigo-900 border-indigo-300",
  quality_check: "bg-orange-100 text-orange-900 border-orange-300",
  ready_to_ship: "bg-emerald-100 text-emerald-900 border-emerald-300",
  shipped: "bg-violet-100 text-violet-900 border-violet-300",
  delivered: "bg-green-100 text-green-900 border-green-300",
  cancelled: "bg-rose-100 text-rose-900 border-rose-300",
};

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
};

const getResolvedAssetUrl = (assetPath: string) => {
  if (/^(data:|blob:|https?:)/i.test(assetPath)) return assetPath;
  if (assetPath.startsWith("/")) return assetPath;
  return `/${assetPath.replace(/^\/+/, "")}`;
};

const downloadAsset = (assetPath: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = getResolvedAssetUrl(assetPath);
  link.download = fileName;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function FactoryDashboard() {
  const [orders, setOrders] = useState<FactoryOrder[]>([]);
  const [events, setEvents] = useState<Record<string, OrderEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<FactoryOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [qualityNotes, setQualityNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let active = true;

    const loadOrders = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (!active) return;

      if (error) {
        console.error(error);
        toast.error("Não foi possível carregar os pedidos da fábrica.");
        setOrders([]);
        setLoading(false);
        return;
      }

      const nextOrders = ((data ?? []) as FactoryOrder[]);
      setOrders(nextOrders);

      const orderIds = nextOrders.map((order) => order.id);
      if (orderIds.length === 0) {
        setEvents({});
        setLoading(false);
        return;
      }

      const { data: eventRows, error: eventsError } = await supabase
        .from("order_events")
        .select("id, order_id, event_type, notes, previous_status, new_status, created_at")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });

      if (!active) return;

      if (eventsError) {
        console.error(eventsError);
        setEvents({});
      } else {
        const grouped = ((eventRows ?? []) as Array<OrderEvent & { order_id: string }>).reduce(
          (acc, item) => {
            if (!acc[item.order_id]) acc[item.order_id] = [];
            acc[item.order_id].push(item);
            return acc;
          },
          {} as Record<string, OrderEvent[]>
        );
        setEvents(grouped);
      }

      setLoading(false);
    };

    void loadOrders();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedOrder) return;
    setNextStatus(selectedOrder.status);
    setTrackingNumber(selectedOrder.tracking_number ?? "");
    setQualityNotes(selectedOrder.quality_check_notes ?? "");
    setNote("");
  }, [selectedOrder]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchStatus = statusFilter === "all" || order.status === statusFilter;
      const matchQuery =
        normalized.length === 0 ||
        order.order_number.toLowerCase().includes(normalized) ||
        order.user_id.toLowerCase().includes(normalized) ||
        (order.shipping_address_city ?? "").toLowerCase().includes(normalized) ||
        (order.shipping_address_state ?? "").toLowerCase().includes(normalized);
      return matchStatus && matchQuery;
    });
  }, [orders, query, statusFilter]);

  const metrics = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((order) => order.status === "pending").length;
    const inProduction = orders.filter((order) => ["approved", "production", "quality_check"].includes(order.status)).length;
    const readyToShip = orders.filter((order) => order.status === "ready_to_ship").length;
    return { total, pending, inProduction, readyToShip };
  }, [orders]);

  const selectedEvents = selectedOrder ? events[selectedOrder.id] ?? [] : [];
  const selectedDecals = selectedOrder ? toStringArray(selectedOrder.decals_paths) : [];
  const selectedSpecs = selectedOrder?.design_specifications ?? {};
  const selectedColors = selectedOrder?.colors ?? {};

  const handleSaveOrder = async () => {
    if (!selectedOrder || !nextStatus) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      status: nextStatus,
      tracking_number: trackingNumber || null,
      quality_check_notes: qualityNotes || null,
      production_started_at:
        nextStatus === "production" && !selectedOrder.production_started_at
          ? new Date().toISOString()
          : selectedOrder.production_started_at ?? null,
      production_completed_at:
        ["ready_to_ship", "shipped", "delivered"].includes(nextStatus)
          ? new Date().toISOString()
          : selectedOrder.production_completed_at ?? null,
    };

    const { data, error } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", selectedOrder.id)
      .select("*")
      .single();

    if (error) {
      console.error(error);
      toast.error("Não foi possível atualizar o pedido.");
      setSaving(false);
      return;
    }

    if (note.trim()) {
      await supabase.from("order_events").insert({
        order_id: selectedOrder.id,
        event_type: "factory_note",
        notes: note.trim(),
        previous_status: selectedOrder.status,
        new_status: nextStatus,
      });
    }

    const updatedOrder = data as FactoryOrder;
    setOrders((prev) => prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
    setSelectedOrder(updatedOrder);
    toast.success("Pedido atualizado.");
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 py-10 space-y-8">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Operação de fábrica</p>
            <h1 className="text-3xl font-semibold tracking-tight">Painel de pedidos</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Acompanhe produção, revise especificações da peça, baixe decals e atualize o fluxo logístico.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:min-w-[640px]">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between pt-0"><span className="text-3xl font-semibold">{metrics.total}</span><Box className="h-5 w-5 text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pendentes</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between pt-0"><span className="text-3xl font-semibold">{metrics.pending}</span><Shirt className="h-5 w-5 text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Em andamento</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between pt-0"><span className="text-3xl font-semibold">{metrics.inProduction}</span><PackageCheck className="h-5 w-5 text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Prontos envio</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between pt-0"><span className="text-3xl font-semibold">{metrics.readyToShip}</span><Truck className="h-5 w-5 text-muted-foreground" /></CardContent>
            </Card>
          </div>
        </section>

        <Card>
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Fila de produção</CardTitle>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative min-w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, cliente ou cidade" className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando pedidos...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
                Nenhum pedido encontrado com os filtros atuais.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Peça</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Atualizado</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{order.order_number}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE[order.status]}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{order.user_id.slice(0, 8)}...</div>
                        <div className="text-xs text-muted-foreground">{order.shipping_address_city || "Sem cidade"}</div>
                      </TableCell>
                      <TableCell>
                        <div>{String(order.design_specifications?.type ?? order.design_specifications?.part ?? "Peça customizada")}</div>
                        <div className="text-xs text-muted-foreground">Qtd. {order.quantity}</div>
                      </TableCell>
                      <TableCell>
                        <div className="capitalize">{order.delivery_type}</div>
                        <div className="text-xs text-muted-foreground">{order.shipping_address_state || "-"}</div>
                      </TableCell>
                      <TableCell>{formatCurrency(order.total_cost)}</TableCell>
                      <TableCell>{formatDateTime(order.updated_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                          Ver detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {selectedOrder.order_number}
                  <Badge variant="outline" className={STATUS_BADGE[selectedOrder.status]}>
                    {STATUS_LABELS[selectedOrder.status]}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-6">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Especificações da peça</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Object.entries(selectedSpecs).map(([key, value]) => (
                          <div key={key} className="rounded-lg border p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                            <p className="mt-1 font-medium">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Object.entries(selectedColors).map(([key, value]) => (
                          <div key={key} className="rounded-lg border p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cor {key}</p>
                            <p className="mt-1 font-medium">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                      {selectedOrder.inscriptions ? (
                        <div className="rounded-lg border p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Inscrição</p>
                          <p className="mt-1 font-medium">{selectedOrder.inscriptions}</p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Arquivos para produção</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Decals</p>
                        {selectedDecals.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum decal salvo neste pedido.</p>
                        ) : (
                          <div className="grid gap-2">
                            {selectedDecals.map((item, index) => (
                              <Button
                                key={`${item}-${index}`}
                                variant="outline"
                                className="justify-between"
                                onClick={() => downloadAsset(item, `${selectedOrder.order_number}-decal-${index + 1}.png`)}
                              >
                                <span>Decal {index + 1}</span>
                                <Download className="h-4 w-4" />
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Modelo 3D</p>
                        {selectedOrder.design_3d_model_path ? (
                          <Button
                            variant="outline"
                            className="justify-between"
                            onClick={() => downloadAsset(selectedOrder.design_3d_model_path as string, `${selectedOrder.order_number}-modelo-3d`)}
                          >
                            <span>{selectedOrder.design_3d_model_path}</span>
                            <Download className="h-4 w-4" />
                          </Button>
                        ) : (
                          <p className="text-sm text-muted-foreground">Modelo 3D não informado.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {selectedEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem eventos registrados ainda.</p>
                      ) : (
                        selectedEvents.map((event) => (
                          <div key={event.id} className="rounded-lg border p-3 text-sm">
                            <p className="font-medium">{event.event_type}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                            {event.notes ? <p className="mt-2">{event.notes}</p> : null}
                            {event.previous_status || event.new_status ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                {event.previous_status ?? "-"} → {event.new_status ?? "-"}
                              </p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Entrega</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>{selectedOrder.shipping_address_street}, {selectedOrder.shipping_address_number}</p>
                      {selectedOrder.shipping_address_complement ? <p>{selectedOrder.shipping_address_complement}</p> : null}
                      <p>{selectedOrder.shipping_address_district}</p>
                      <p>{selectedOrder.shipping_address_city} - {selectedOrder.shipping_address_state}</p>
                      <p>CEP {selectedOrder.shipping_address_postal_code}</p>
                      <p className="pt-2 text-muted-foreground">Frete: {formatCurrency(selectedOrder.shipping_cost)}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Atualizar pedido</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as OrderStatus)}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Código de rastreio</Label>
                        <Input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="BR123456789" />
                      </div>
                      <div className="space-y-2">
                        <Label>Notas de qualidade</Label>
                        <Textarea value={qualityNotes} onChange={(event) => setQualityNotes(event.target.value)} placeholder="Observações da conferência, falhas, ajustes..." />
                      </div>
                      <div className="space-y-2">
                        <Label>Nota operacional</Label>
                        <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Registrar etapa, problema ou comunicação interna..." />
                      </div>
                      <Button className="w-full" onClick={handleSaveOrder} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar atualização
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Resumo financeiro</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>Quantidade</span><span>{selectedOrder.quantity}</span></div>
                      <div className="flex items-center justify-between"><span>Unitário</span><span>{formatCurrency(selectedOrder.unit_price)}</span></div>
                      <div className="flex items-center justify-between"><span>Entrega</span><span>{formatCurrency(selectedOrder.shipping_cost)}</span></div>
                      <div className="flex items-center justify-between font-semibold"><span>Total</span><span>{formatCurrency(selectedOrder.total_cost)}</span></div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}