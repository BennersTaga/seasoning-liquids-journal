'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Warehouse, Archive, Beaker, Factory, Trash2, Boxes, ChefHat } from "lucide-react";
import { format } from "date-fns";
import { mutate } from "swr";

import { apiPost } from "@/lib/gas";
import { useMasters } from "@/hooks/useMasters";
import { useOrders } from "@/hooks/useOrders";
import { useStorageAgg } from "@/hooks/useStorageAgg";
import type { Masters, OrderRow, StorageAggRow } from "@/lib/sheets/types";

type FlavorRecipeItem = { ingredient: string; qty: number; unit: string };

interface FlavorWithRecipe {
  id: string;
  flavorName: string;
  liquidName: string;
  packToGram: number;
  expiryDays: number;
  recipe: FlavorRecipeItem[];
}

interface OrderLine {
  flavorId: string;
  packs: number;
  requiredGrams: number;
  useType: "fissule" | "oem";
  oemPartner?: string;
  oemGrams?: number;
}

interface OrderCard {
  orderId: string;
  lotId: string;
  factoryCode: string;
  orderedAt: string;
  lines: OrderLine[];
  archived: boolean;
}

interface StorageAggEntry {
  lotId: string;
  factoryCode: string;
  flavorId: string;
  grams: number;
  locations: string[];
  manufacturedAt: string;
}

type MadeReport = {
  packs: number;
  grams: number;
  manufacturedAt: string;
  result: "extra" | "used";
  leftover?: { location: string; grams: number } | null;
};

type KeepFormValues = { location: string; grams: number; manufacturedAt: string };

const defaultFlavor: FlavorWithRecipe = {
  id: "",
  flavorName: "未設定",
  liquidName: "未設定",
  packToGram: 0,
  expiryDays: 0,
  recipe: [],
};

const selectFallback = (loading: boolean, emptyLabel = "データなし") => (
  <div className="px-2 py-1 text-sm text-muted-foreground">
    {loading ? "読み込み中..." : emptyLabel}
  </div>
);

const grams = (n: number) => `${n.toLocaleString()} g`;
const genLotId = (factoryCode: string, seq: number, d = new Date()) =>
  `${factoryCode}-${format(d, "yyyyMMdd")}-${String(seq).padStart(3, "0")}`;

function deriveDataFromMasters(masters?: Masters) {
  const factories =
    masters?.factories?.map(factory => ({
      code: factory.factory_code,
      name: factory.factory_name,
    })) ?? [];

  const storageByFactory: Record<string, string[]> = {};
  factories.forEach(factory => {
    storageByFactory[factory.code] = [];
  });
  masters?.locations?.forEach(location => {
    if (!storageByFactory[location.factory_code]) {
      storageByFactory[location.factory_code] = [];
    }
    storageByFactory[location.factory_code].push(location.location_name);
  });

  const recipeMap =
    masters?.recipes?.reduce<Map<string, FlavorRecipeItem[]>>((map, row) => {
      const arr = map.get(row.flavor_id) ?? [];
      arr.push({ ingredient: row.ingredient_name, qty: row.qty, unit: row.unit });
      map.set(row.flavor_id, arr);
      return map;
    }, new Map()) ?? new Map();

  const flavors: FlavorWithRecipe[] =
    masters?.flavors?.map(fl => ({
      id: fl.flavor_id,
      flavorName: fl.flavor_name,
      liquidName: fl.liquid_name,
      packToGram: fl.pack_to_gram,
      expiryDays: fl.expiry_days,
      recipe: recipeMap.get(fl.flavor_id) ?? [],
    })) ?? [];

  const oemList = masters?.oem_partners?.map(partner => partner.partner_name) ?? [];

  return { factories, storageByFactory, flavors, oemList };
}

function normalizeOrders(rows?: OrderRow[]): OrderCard[] {
  if (!rows?.length) return [];
  const map = new Map<string, OrderCard>();
  rows.forEach(row => {
    const line: OrderLine =
      row.use_type === "fissule"
        ? {
            flavorId: row.flavor_id,
            packs: row.packs,
            requiredGrams: row.required_grams,
            useType: "fissule",
          }
        : {
            flavorId: row.flavor_id,
            packs: 0,
            requiredGrams: row.required_grams,
            useType: "oem",
            oemPartner: row.oem_partner ?? undefined,
            oemGrams: row.required_grams,
          };
    const existing = map.get(row.order_id);
    if (existing) {
      existing.lines.push(line);
      existing.archived = row.archived;
    } else {
      map.set(row.order_id, {
        orderId: row.order_id,
        lotId: row.lot_id,
        factoryCode: row.factory_code,
        orderedAt: row.ordered_at,
        lines: [line],
        archived: row.archived,
      });
    }
  });
  return Array.from(map.values());
}

function normalizeStorage(rows?: StorageAggRow[]): StorageAggEntry[] {
  if (!rows?.length) return [];
  return rows
    .map(row => ({
      lotId: row.lot_id,
      factoryCode: row.factory_code,
      flavorId: row.flavor_id,
      grams: row.grams,
      locations: row.locations ?? [],
      manufacturedAt: row.manufactured_at,
    }))
    .filter(entry => Math.abs(entry.grams) > 0);
}

export default function App() {
  const [tab, setTab] = useState("office");
  const mastersQuery = useMasters();
  const mastersData = mastersQuery.data;
  const mastersLoading = mastersQuery.isLoading || (!mastersData && !mastersQuery.error);

  const { factories, storageByFactory, flavors, oemList } = useMemo(
    () => deriveDataFromMasters(mastersData),
    [mastersData],
  );

  const findFlavor = useCallback(
    (id: string) => {
      if (!flavors.length) {
        return { ...defaultFlavor, id, flavorName: id, liquidName: id };
      }
      return (
        flavors.find(fl => fl.id === id) ?? {
          ...defaultFlavor,
          id,
          flavorName: id,
          liquidName: id,
        }
      );
    },
    [flavors],
  );

  const calcExpiry = useCallback(
    (manufacturedAt: string, flavorId: string) => {
      const flavor = findFlavor(flavorId);
      const days = flavor?.expiryDays ?? 0;
      if (!manufacturedAt) return "-";
      const d = new Date(manufacturedAt);
      if (Number.isNaN(d.getTime())) return "-";
      d.setDate(d.getDate() + days);
      return format(d, "yyyy-MM-dd");
    },
    [findFlavor],
  );

  const registerOnsiteMake = useCallback(
    async (
      factoryCode: string,
      flavorId: string,
      useType: "fissule" | "oem",
      producedG: number,
      manufacturedAt: string,
      oemPartner?: string,
      leftover?: { loc: string; grams: number },
    ) => {
      if (!factoryCode || !flavorId || !manufacturedAt || producedG <= 0) {
        return;
      }
      const payload = {
        factory_code: factoryCode,
        flavor_id: flavorId,
        use_type: useType,
        produced_grams: producedG,
        manufactured_at: manufacturedAt,
        oem_partner: useType === "oem" ? oemPartner ?? null : null,
        leftover:
          leftover && leftover.grams > 0
            ? { location: leftover.loc, grams: leftover.grams }
            : null,
      };
      try {
        await apiPost("onsite-make", payload);
        await Promise.all([
          mutate(["orders", factoryCode, false]),
          mutate(["storage-agg", factoryCode]),
        ]);
      } catch (error) {
        console.error(error);
        alert("通信に失敗しました");
        throw error;
      }
    },
    [],
  );

  return (
    <div className="min-h-screen bg-orange-50 p-6 mx-auto max-w-7xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">調味液日報 UI プロトタイプ</h1>
        <div className="text-sm opacity-80">タブで「オフィス / 現場」を切替</div>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 w-full md:w-96">
          <TabsTrigger value="office" className="flex gap-2">
            <Factory className="h-4 w-4" />オフィス（5F/管理）
          </TabsTrigger>
          <TabsTrigger value="floor" className="flex gap-2">
            <Boxes className="h-4 w-4" />現場（フロア）
          </TabsTrigger>
        </TabsList>
        <TabsContent value="office" className="mt-6">
          <Office
            factories={factories}
            flavors={flavors}
            oemList={oemList}
            findFlavor={findFlavor}
            mastersLoading={mastersLoading}
          />
        </TabsContent>
        <TabsContent value="floor" className="mt-6">
          <Floor
            factories={factories}
            flavors={flavors}
            findFlavor={findFlavor}
            storageByFactory={storageByFactory}
            oemList={oemList}
            calcExpiry={calcExpiry}
            registerOnsiteMake={registerOnsiteMake}
            mastersLoading={mastersLoading}
          />
        </TabsContent>
      </Tabs>
      <footer className="text-xs text-center text-muted-foreground opacity-70">GAS 連携バージョン</footer>
    </div>
  );
}

function Office({
  factories,
  flavors,
  oemList,
  findFlavor,
  mastersLoading,
}: {
  factories: { code: string; name: string }[];
  flavors: FlavorWithRecipe[];
  oemList: string[];
  findFlavor: (id: string) => FlavorWithRecipe;
  mastersLoading: boolean;
}) {
  const [factory, setFactory] = useState(factories[0]?.code ?? "");
  const [flavor, setFlavor] = useState(flavors[0]?.id ?? "");
  const [useType, setUseType] = useState<"fissule" | "oem">("fissule");
  const [packs, setPacks] = useState(100);
  const [oemPartner, setOemPartner] = useState(oemList[0] ?? "");
  const [oemGrams, setOemGrams] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const seqRef = useRef<Record<string, number>>({});
  const factoryDisabled = mastersLoading || factories.length === 0;
  const flavorDisabled = mastersLoading || flavors.length === 0;
  const oemDisabled = mastersLoading || oemList.length === 0;

  useEffect(() => {
    if (factories.length && !factories.some(f => f.code === factory)) {
      setFactory(factories[0].code);
    }
  }, [factories, factory]);

  useEffect(() => {
    if (flavors.length && !flavors.some(fl => fl.id === flavor)) {
      setFlavor(flavors[0].id);
    }
  }, [flavors, flavor]);

  useEffect(() => {
    if (oemList.length && !oemList.includes(oemPartner)) {
      setOemPartner(oemList[0]);
    }
  }, [oemList, oemPartner]);

  const ordersQuery = useOrders(factory || undefined, false);
  const orderCards = useMemo(() => normalizeOrders(ordersQuery.data), [ordersQuery.data]);
  const openOrders = useMemo(() => orderCards.filter(order => !order.archived), [orderCards]);

  useEffect(() => {
    const next = { ...seqRef.current };
    orderCards.forEach(order => {
      const parts = order.lotId.split("-");
      if (parts.length < 3) return;
      const factoryCode = parts[0];
      const datePart = parts[1];
      const suffix = parts[parts.length - 1];
      const numeric = Number.parseInt(suffix, 10);
      if (Number.isNaN(numeric)) return;
      const key = `${factoryCode}-${datePart}`;
      const candidate = numeric + 1;
      if (!next[key] || next[key] < candidate) {
        next[key] = candidate;
      }
    });
    seqRef.current = next;
  }, [orderCards]);

  const createOrder = useCallback(async () => {
    if (!factory || !flavor) return;
    if (useType === "fissule" && packs <= 0) return;
    if (useType === "oem" && (!oemPartner || oemGrams <= 0)) return;
    const today = new Date();
    const dateSegment = format(today, "yyyyMMdd");
    const key = `${factory}-${dateSegment}`;
    const seq = seqRef.current[key] ?? 1;
    const lotId = genLotId(factory, seq, today);
    const orderedAt = format(today, "yyyy-MM-dd");
    const line =
      useType === "fissule"
        ? {
            flavor_id: flavor,
            use_type: "fissule" as const,
            packs,
            required_grams: packs * (findFlavor(flavor)?.packToGram ?? 0),
            oem_partner: null,
            oem_grams: null,
          }
        : {
            flavor_id: flavor,
            use_type: "oem" as const,
            packs: 0,
            required_grams: oemGrams,
            oem_partner: oemPartner,
            oem_grams: oemGrams,
          };
    const payload = {
      path: "orders-create" as const,
      factory_code: factory,
      lot_id: lotId,
      ordered_at: orderedAt,
      lines: [line],
    };
    try {
      setSubmitting(true);
      await apiPost("action", payload);
      seqRef.current[key] = seq + 1;
      await mutate(["orders", factory, false]);
    } catch (error) {
      console.error(error);
      alert("通信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }, [factory, flavor, useType, packs, oemPartner, oemGrams, findFlavor]);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />製造指示チケットの作成
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>製造場所</Label>
            <Select value={factory} onValueChange={setFactory}>
              <SelectTrigger disabled={factoryDisabled}>
                <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
              </SelectTrigger>
              <SelectContent>
                {factories.length
                  ? factories.map(f => (
                      <SelectItem key={f.code} value={f.code}>
                        {f.name}（{f.code}）
                      </SelectItem>
                    ))
                  : selectFallback(mastersLoading)}
              </SelectContent>
            </Select>
          </div>
          {useType === "fissule" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label>味付け</Label>
                <Select value={flavor} onValueChange={setFlavor}>
                  <SelectTrigger disabled={flavorDisabled}>
                    <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
                  </SelectTrigger>
                  <SelectContent>
                    {flavors.length
                      ? flavors.map(fl => (
                          <SelectItem key={fl.id} value={fl.id}>
                            {fl.flavorName}
                          </SelectItem>
                        ))
                      : selectFallback(mastersLoading)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>用途</Label>
                <Select value={useType} onValueChange={(value: "fissule" | "oem") => setUseType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fissule">製品（パック）</SelectItem>
                    <SelectItem value="oem">OEM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>パック数</Label>
                <Input
                  type="number"
                  value={packs}
                  onChange={e => setPacks(Number.parseInt(e.target.value || "0", 10))}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  必要量: {grams(packs * (findFlavor(flavor)?.packToGram ?? 0))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label>味付け</Label>
                <Select value={flavor} onValueChange={setFlavor}>
                  <SelectTrigger disabled={flavorDisabled}>
                    <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
                  </SelectTrigger>
                  <SelectContent>
                    {flavors.length
                      ? flavors.map(fl => (
                          <SelectItem key={fl.id} value={fl.id}>
                            {fl.flavorName}
                          </SelectItem>
                        ))
                      : selectFallback(mastersLoading)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>用途</Label>
                <Select value={useType} onValueChange={(value: "fissule" | "oem") => setUseType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fissule">製品（パック）</SelectItem>
                    <SelectItem value="oem">OEM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>OEM先</Label>
                <Select value={oemPartner} onValueChange={setOemPartner}>
                  <SelectTrigger disabled={oemDisabled}>
                    <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
                  </SelectTrigger>
                  <SelectContent>
                    {oemList.length
                      ? oemList.map(x => (
                          <SelectItem key={x} value={x}>
                            {x}
                          </SelectItem>
                        ))
                      : selectFallback(mastersLoading)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
                <Label>作成グラム数（g）</Label>
                <Input
                  type="number"
                  value={oemGrams}
                  onChange={e => setOemGrams(Number.parseInt(e.target.value || "0", 10))}
                />
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={createOrder} disabled={submitting}>
              チケットを登録
            </Button>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Beaker className="h-4 w-4" />
              <span>パック→g は味付け設定で自動換算</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />進捗（未アーカイブ）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[540px] overflow-auto pr-2">
          {openOrders.map(order => (
            <div key={order.orderId} className="border rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {order.lotId}{" "}
                  <Badge variant="secondary" className="ml-2">
                    {factories.find(f => f.code === order.factoryCode)?.name || order.factoryCode}
                  </Badge>
                </div>
                <div className="text-xs opacity-70">指示日 {order.orderedAt}</div>
              </div>
              {order.lines.map((ln, idx) => {
                const f = findFlavor(ln.flavorId);
                return (
                  <div key={idx} className="text-sm grid gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="味付け">{f.flavorName}</Field>
                      <Field label="用途">{ln.useType === "oem" ? "OEM" : "製品"}</Field>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label={ln.useType === "fissule" ? "パック数" : "OEM先"}>
                        {ln.useType === "fissule" ? ln.packs : ln.oemPartner}
                      </Field>
                      <Field label="必要量">
                        <span className="font-semibold">{grams(ln.requiredGrams)}</span>
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {openOrders.length === 0 && (
            <div className="text-sm text-muted-foreground">未処理の指示はありません</div>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Badge variant="outline" className="gap-1">
            <Archive className="h-3 w-3" /> アーカイブは現場側から
          </Badge>
        </CardFooter>
      </Card>
    </div>
  );
}

function Floor({
  factories,
  flavors,
  findFlavor,
  storageByFactory,
  oemList,
  calcExpiry,
  registerOnsiteMake,
  mastersLoading,
}: {
  factories: { code: string; name: string }[];
  flavors: FlavorWithRecipe[];
  findFlavor: (id: string) => FlavorWithRecipe;
  storageByFactory: Record<string, string[]>;
  oemList: string[];
  calcExpiry: (manufacturedAt: string, flavorId: string) => string;
  registerOnsiteMake: (
    factoryCode: string,
    flavorId: string,
    useType: "fissule" | "oem",
    producedG: number,
    manufacturedAt: string,
    oemPartner?: string,
    leftover?: { loc: string; grams: number },
  ) => Promise<void>;
  mastersLoading: boolean;
}) {
  const [factory, setFactory] = useState(factories[0]?.code ?? "");
  const [extraOpen, setExtraOpen] = useState(false);
  const factoryDisabled = mastersLoading || factories.length === 0;

  useEffect(() => {
    if (!factories.length) {
      setFactory("");
      return;
    }
    if (!factory || !factories.some(f => f.code === factory)) {
      setFactory(factories[0].code);
    }
  }, [factories, factory]);

  const ordersQuery = useOrders(factory || undefined, false);
  const storageAggQuery = useStorageAgg(factory || undefined);

  const orders = useMemo(() => normalizeOrders(ordersQuery.data), [ordersQuery.data]);
  const storageAgg = useMemo(() => normalizeStorage(storageAggQuery.data), [storageAggQuery.data]);

  const openOrders = useMemo(
    () => orders.filter(order => !order.archived && order.factoryCode === factory),
    [orders, factory],
  );

  const handleKeep = useCallback(
    async (order: OrderCard, values: KeepFormValues) => {
      const line = order.lines[0];
      try {
        await apiPost("action", {
          type: "KEEP",
          factory_code: order.factoryCode,
          lot_id: order.lotId,
          flavor_id: line.flavorId,
          payload: {
            location: values.location,
            grams: values.grams,
            manufactured_at: values.manufacturedAt,
          },
        });
        await Promise.all([
          mutate(["storage-agg", order.factoryCode]),
          mutate(["orders", order.factoryCode, false]),
        ]);
      } catch (error) {
        console.error(error);
        alert("通信に失敗しました");
        throw error;
      }
    },
    [],
  );

  const handleReportMade = useCallback(
    async (order: OrderCard, report: MadeReport) => {
      const line = order.lines[0];
      const leftoverPayload = report.leftover && report.leftover.grams > 0
        ? { location: report.leftover.location, grams: report.leftover.grams }
        : null;
      try {
        await apiPost("action", {
          type: "MADE_SPLIT",
          factory_code: order.factoryCode,
          lot_id: order.lotId,
          flavor_id: line.flavorId,
          payload: {
            packs: Math.max(0, report.packs),
            grams: report.grams,
            manufactured_at: report.manufacturedAt,
            result: report.result,
            leftover: leftoverPayload,
          },
        });
        await Promise.all([
          mutate(["orders", order.factoryCode, false]),
          mutate(["storage-agg", order.factoryCode]),
        ]);
      } catch (error) {
        console.error(error);
        alert("通信に失敗しました");
        throw error;
      }
    },
    [],
  );

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <div className="flex items-center gap-3">
        <Label>製造場所</Label>
        <Select value={factory} onValueChange={setFactory}>
          <SelectTrigger className="w-56" disabled={factoryDisabled}>
            <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
          </SelectTrigger>
          <SelectContent>
            {factories.length
              ? factories.map(f => (
                  <SelectItem key={f.code} value={f.code}>
                    {f.name}（{f.code}）
                  </SelectItem>
                ))
              : selectFallback(mastersLoading)}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2 grid md:grid-cols-2 gap-6">
        <KanbanColumn
          title="製造指示"
          icon={<ChefHat className="h-4 w-4" />}
          rightSlot={
            <Button variant="outline" onClick={() => setExtraOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" />追加で作成
            </Button>
          }
        >
          {openOrders.map(order => (
            <OrderCardView
              key={order.orderId}
              order={order}
              remainingPacks={Math.max(0, order.lines[0]?.packs ?? 0)}
              onKeep={values => handleKeep(order, values)}
              onReportMade={report => handleReportMade(order, report)}
              findFlavor={findFlavor}
              storageByFactory={storageByFactory}
              mastersLoading={mastersLoading}
            />
          ))}
          {openOrders.length === 0 && <Empty>ここにカードが表示されます</Empty>}
        </KanbanColumn>
        <KanbanColumn title="保管（在庫）" icon={<Warehouse className="h-4 w-4" />}>
          {storageAgg.map(agg => (
            <StorageCardView
              key={agg.lotId}
              agg={agg}
              findFlavor={findFlavor}
              calcExpiry={calcExpiry}
              factoryCode={factory}
            />
          ))}
          {storageAgg.length === 0 && <Empty>余剰の在庫はここに集計されます</Empty>}
        </KanbanColumn>
      </div>
      <OnsiteMakeDialog
        open={extraOpen}
        onClose={() => setExtraOpen(false)}
        defaultFlavorId={flavors[0]?.id ?? ""}
        factoryCode={factory}
        onRegister={registerOnsiteMake}
        flavors={flavors}
        oemList={oemList}
        findFlavor={findFlavor}
        storageByFactory={storageByFactory}
        mastersLoading={mastersLoading}
      />
    </div>
  );
}

function KanbanColumn({
  title,
  icon,
  rightSlot,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>
          {rightSlot}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[560px] overflow-auto pr-1">
        {children}
      </CardContent>
    </Card>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm text-muted-foreground border rounded-xl p-6 text-center">{children}</div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1 min-w-[120px]">
    <div className="inline-flex items-center rounded-md bg-slate-800 text-white px-2 py-0.5 text-[11px] tracking-wide">
      {label}
    </div>
    <div className="text-sm font-medium leading-tight">{children}</div>
  </div>
);

function OrderCardView({
  order,
  remainingPacks,
  onKeep,
  onReportMade,
  findFlavor,
  storageByFactory,
  mastersLoading,
}: {
  order: OrderCard;
  remainingPacks: number;
  onKeep: (values: KeepFormValues) => Promise<void>;
  onReportMade: (report: MadeReport) => Promise<void>;
  findFlavor: (id: string) => FlavorWithRecipe;
  storageByFactory: Record<string, string[]>;
  mastersLoading: boolean;
}) {
  const [open, setOpen] = useState<null | "keep" | "made" | "skip" | "choice" | "split">(null);
  const line = order.lines[0];
  const flavor = findFlavor(line.flavorId);
  const reset = () => setOpen(null);
  const canSplit = line.useType === "fissule" && (line.packs ?? 0) > 0;

  return (
    <Card className="border rounded-xl">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">
            {order.lotId}{" "}
            <Badge variant="secondary" className="ml-2">
              {order.factoryCode}
            </Badge>
          </div>
          <div className="text-xs opacity-70">指示日 {order.orderedAt}</div>
        </div>
        <div className="text-sm grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="味付け">{flavor.flavorName}</Field>
            <Field label="用途">{line.useType === "oem" ? "OEM" : "製品"}</Field>
          </div>
          {line.useType === "fissule" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="パック数">
                {line.packs}（残り {remainingPacks}）
              </Field>
              <Field label="必要量">{grams(line.requiredGrams)}</Field>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen("keep")}>保管</Button>
          <Button onClick={() => setOpen("choice")}>作った</Button>
          <Button variant="secondary" onClick={() => setOpen("skip")}>作らない</Button>
        </div>
      </CardContent>
      <KeepDialog
        open={open === "keep"}
        onClose={reset}
        factoryCode={order.factoryCode}
        storageByFactory={storageByFactory}
        onSubmit={onKeep}
        mastersLoading={mastersLoading}
      />
      <MadeDialog2
        open={open === "made"}
        mode="bulk"
        onClose={reset}
        order={order}
        remaining={remainingPacks}
        onReport={onReportMade}
        findFlavor={findFlavor}
        storageByFactory={storageByFactory}
        mastersLoading={mastersLoading}
      />
      <MadeChoiceDialog
        open={open === "choice"}
        onClose={reset}
        canSplit={canSplit}
        onBulk={() => setOpen("made")}
        onSplit={() => setOpen("split")}
      />
      <MadeDialog2
        open={open === "split"}
        mode="split"
        onClose={reset}
        order={order}
        remaining={remainingPacks}
        onReport={onReportMade}
        findFlavor={findFlavor}
        storageByFactory={storageByFactory}
        mastersLoading={mastersLoading}
      />
      <Dialog open={open === "skip"} onOpenChange={o => { if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>作らない理由（任意）</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MadeChoiceDialog({
  open,
  onClose,
  canSplit,
  onBulk,
  onSplit,
}: {
  open: boolean;
  onClose: () => void;
  canSplit: boolean;
  onBulk: () => void;
  onSplit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>報告の種類を選択</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Button onClick={onBulk}>一括で作った</Button>
          <Button variant="outline" onClick={onSplit} disabled={!canSplit}>
            分割して作った
          </Button>
          {!canSplit && (
            <div className="text-xs text-muted-foreground">
              ※ OEM やパック数未設定の指示では分割できません
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>閉じる</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeepDialog({
  open,
  onClose,
  factoryCode,
  storageByFactory,
  onSubmit,
  mastersLoading,
}: {
  open: boolean;
  onClose: () => void;
  factoryCode: string;
  storageByFactory: Record<string, string[]>;
  onSubmit: (values: KeepFormValues) => Promise<void>;
  mastersLoading: boolean;
}) {
  const [loc, setLoc] = useState("");
  const [gramsValue, setGramsValue] = useState(0);
  const [manufacturedAt, setManufacturedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [submitting, setSubmitting] = useState(false);
  const locations = storageByFactory[factoryCode] || [];

  useEffect(() => {
    if (open) {
      setLoc("");
      setGramsValue(0);
      setManufacturedAt(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!loc || gramsValue <= 0 || !manufacturedAt) return;
    try {
      setSubmitting(true);
      await onSubmit({ location: loc, grams: gramsValue, manufacturedAt });
      onClose();
    } catch {
      // keep dialog open
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>保管登録</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>保管場所</Label>
              <Select value={loc} onValueChange={setLoc}>
                <SelectTrigger disabled={mastersLoading || locations.length === 0}>
                  <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
                </SelectTrigger>
                <SelectContent>
                  {locations.length
                    ? locations.map(l => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))
                    : selectFallback(mastersLoading)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>数量（g）</Label>
              <Input
                type="number"
                value={gramsValue}
                onChange={e => setGramsValue(Number.parseInt(e.target.value || "0", 10))}
              />
            </div>
            <div>
              <Label>製造日</Label>
              <Input type="date" value={manufacturedAt} onChange={e => setManufacturedAt(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button disabled={!loc || gramsValue <= 0 || !manufacturedAt || submitting} onClick={handleSubmit}>
            登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MadeDialog2({
  open,
  onClose,
  order,
  mode,
  remaining,
  onReport,
  findFlavor,
  storageByFactory,
  mastersLoading,
}: {
  open: boolean;
  onClose: () => void;
  order: OrderCard;
  mode: "bulk" | "split";
  remaining: number;
  onReport: (report: MadeReport) => Promise<void>;
  findFlavor: (id: string) => FlavorWithRecipe;
  storageByFactory: Record<string, string[]>;
  mastersLoading: boolean;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [recipeQty, setRecipeQty] = useState<Record<string, number>>({});
  const [manufacturedAt, setManufacturedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [outcome, setOutcome] = useState<"extra" | "used" | "">("");
  const [leftLoc, setLeftLoc] = useState("");
  const [leftGrams, setLeftGrams] = useState(0);
  const [packsMade, setPacksMade] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const line = order.lines[0];
  const flavor = findFlavor(line.flavorId);
  const showPackInput = line.useType === "fissule" && (line.packs || 0) > 0;
  const locations = storageByFactory[order.factoryCode] || [];

  useEffect(() => {
    if (open) {
      const init: Record<string, number> = {};
      flavor.recipe.forEach(r => {
        init[r.ingredient] = r.qty;
      });
      setRecipeQty(init);
      setChecked({});
      setOutcome("");
      setLeftLoc("");
      setLeftGrams(0);
      setManufacturedAt(format(new Date(), "yyyy-MM-dd"));
      const def = showPackInput && mode === "bulk"
        ? Math.max(0, Math.min(line.packs || 0, remaining || line.packs || 0))
        : 0;
      setPacksMade(def);
    }
  }, [open, flavor, line.packs, mode, remaining, showPackInput]);

  const allChecked = flavor.recipe.every(r => checked[r.ingredient]);
  const tooMuch = showPackInput && packsMade > Math.max(0, remaining);

  const submit = async () => {
    if (showPackInput && (packsMade <= 0 || tooMuch)) return;
    if (outcome !== "extra" && outcome !== "used") return;
    const packsValue = showPackInput ? packsMade : 0;
    const gramsValue = showPackInput
      ? packsMade * (flavor.packToGram ?? 0)
      : line.requiredGrams;
    const leftoverPayload =
      outcome === "extra" && leftGrams > 0 && leftLoc
        ? { location: leftLoc, grams: leftGrams }
        : null;
    try {
      setSubmitting(true);
      await onReport({
        packs: packsValue,
        grams: gramsValue,
        manufacturedAt,
        result: outcome,
        leftover: leftoverPayload,
      });
      onClose();
    } catch {
      // keep dialog open
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>作った（レシピ確認 → 結果）</DialogTitle>
        </DialogHeader>
        <div className="rounded-xl border p-3 space-y-3">
          <div className="text-sm font-medium">レシピ：{flavor.liquidName}</div>
          {flavor.recipe.map((r, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`mk-${idx}`}
                  checked={!!checked[r.ingredient]}
                  onCheckedChange={v => setChecked(prev => ({ ...prev, [r.ingredient]: Boolean(v) }))}
                />
                <Label htmlFor={`mk-${idx}`}>{r.ingredient}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="w-24"
                  type="number"
                  value={recipeQty[r.ingredient] ?? r.qty}
                  onChange={e => setRecipeQty(prev => ({ ...prev, [r.ingredient]: Number.parseInt(e.target.value || "0", 10) }))}
                />
                <span className="text-sm opacity-80">{r.unit}</span>
              </div>
            </div>
          ))}
        </div>
        {showPackInput ? (
          <div className="grid md:grid-cols-3 gap-3 bg-muted/30 rounded-md p-3 items-end">
            <div className="md:col-span-2">
              <Label>今回作成パック数</Label>
              <Input
                type="number"
                value={packsMade}
                onChange={e => setPacksMade(Number.parseInt(e.target.value || "0", 10))}
              />
              <div className={`text-xs mt-1 ${tooMuch ? "text-red-600" : ""}`}>
                最大 残り {Math.max(0, remaining)} パック
              </div>
            </div>
            <div>
              <Label>製造日</Label>
              <Input type="date" value={manufacturedAt} onChange={e => setManufacturedAt(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-3 bg-muted/30 rounded-md p-3">
            {line.useType === "oem" && <Field label="作成量">{grams(line.oemGrams || line.requiredGrams)}</Field>}
            <Field label="製造日">
              <Input type="date" value={manufacturedAt} onChange={e => setManufacturedAt(e.target.value)} />
            </Field>
          </div>
        )}
        {mode === "split" && (
          <div className="text-xs text-muted-foreground">
            登録時にロット番号は <span className="font-mono">{order.lotId}-XX</span>（通し番号）として保存されます。
          </div>
        )}
        <div className="grid md:grid-cols-3 gap-3 mt-2">
          <div>
            <Label>結果</Label>
            <Select value={outcome} onValueChange={(value: "extra" | "used") => setOutcome(value)}>
              <SelectTrigger>
                <SelectValue placeholder="選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="extra">余った</SelectItem>
                <SelectItem value="used">使い切った</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {outcome === "extra" && (
          <div className="grid md:grid-cols-2 gap-3 border rounded-xl p-3">
            <div>
              <Label>保管場所</Label>
              <Select value={leftLoc} onValueChange={setLeftLoc}>
                <SelectTrigger disabled={mastersLoading || locations.length === 0}>
                  <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
                </SelectTrigger>
                <SelectContent>
                  {locations.length
                    ? locations.map(l => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))
                    : selectFallback(mastersLoading)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>余り数量（g）</Label>
              <Input
                type="number"
                value={leftGrams}
                onChange={e => setLeftGrams(Number.parseInt(e.target.value || "0", 10))}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button
            disabled={
              !allChecked ||
              !manufacturedAt ||
              submitting ||
              (showPackInput && (packsMade <= 0 || tooMuch)) ||
              (outcome === "extra" && (!leftLoc || leftGrams <= 0)) ||
              outcome === ""
            }
            onClick={submit}
          >
            登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OnsiteMakeDialog({
  open,
  onClose,
  defaultFlavorId,
  factoryCode,
  onRegister,
  flavors,
  oemList,
  findFlavor,
  storageByFactory,
  mastersLoading,
}: {
  open: boolean;
  onClose: () => void;
  defaultFlavorId: string;
  factoryCode: string;
  onRegister: (
    factoryCode: string,
    flavorId: string,
    useType: "fissule" | "oem",
    producedG: number,
    manufacturedAt: string,
    oemPartner?: string,
    leftover?: { loc: string; grams: number },
  ) => Promise<void>;
  flavors: FlavorWithRecipe[];
  oemList: string[];
  findFlavor: (id: string) => FlavorWithRecipe;
  storageByFactory: Record<string, string[]>;
  mastersLoading: boolean;
}) {
  const [flavorId, setFlavorId] = useState(defaultFlavorId);
  const [manufacturedAt, setManufacturedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [useType, setUseType] = useState<"fissule" | "oem">("fissule");
  const [oemPartner, setOemPartner] = useState(oemList[0] ?? "");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<"extra" | "used" | "">("");
  const [leftLoc, setLeftLoc] = useState("");
  const [leftG, setLeftG] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const flavor = findFlavor(flavorId);
  const sum = Object.keys(qty).reduce((acc, key) => acc + (checked[key] ? qty[key] || 0 : 0), 0);
  const flavorDisabled = mastersLoading || flavors.length === 0;
  const oemDisabled = mastersLoading || oemList.length === 0;
  const locations = storageByFactory[factoryCode] || [];

  useEffect(() => {
    setChecked({});
    setQty({});
  }, [flavorId]);

  useEffect(() => {
    if (open) {
      setFlavorId(defaultFlavorId);
      setUseType("fissule");
      setOemPartner(oemList[0] ?? "");
      setOutcome("");
      setLeftLoc("");
      setLeftG(0);
      setManufacturedAt(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open, defaultFlavorId, oemList]);

  const submit = async () => {
    const leftover = outcome === "extra" && leftLoc && leftG > 0 ? { loc: leftLoc, grams: leftG } : undefined;
    try {
      setSubmitting(true);
      await onRegister(
        factoryCode,
        flavorId,
        useType,
        sum,
        manufacturedAt,
        useType === "oem" ? oemPartner : undefined,
        leftover,
      );
      onClose();
    } catch {
      // keep dialog open
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>追加で作成（現場報告）</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <Label>レシピ</Label>
            <Select value={flavorId} onValueChange={setFlavorId}>
              <SelectTrigger disabled={flavorDisabled}>
                <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
              </SelectTrigger>
              <SelectContent>
                {flavors.length
                  ? flavors.map(fl => (
                      <SelectItem key={fl.id} value={fl.id}>
                        {fl.flavorName}
                      </SelectItem>
                    ))
                  : selectFallback(mastersLoading)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>用途</Label>
            <Select value={useType} onValueChange={(value: "fissule" | "oem") => setUseType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fissule">製品</SelectItem>
                <SelectItem value="oem">OEM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>製造日</Label>
            <Input type="date" value={manufacturedAt} onChange={e => setManufacturedAt(e.target.value)} />
          </div>
        </div>
        {useType === "oem" && (
          <div>
            <Label>OEM先</Label>
            <Select value={oemPartner} onValueChange={setOemPartner}>
              <SelectTrigger disabled={oemDisabled}>
                <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
              </SelectTrigger>
              <SelectContent>
                {oemList.length
                  ? oemList.map(x => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))
                  : selectFallback(mastersLoading)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="rounded-xl border p-3 space-y-3">
          <div className="text-sm font-medium">レシピ：{flavor.liquidName}</div>
          {flavor.recipe.map((r, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`ing2-${idx}`}
                  checked={!!checked[r.ingredient]}
                  onCheckedChange={v => setChecked(prev => ({ ...prev, [r.ingredient]: Boolean(v) }))}
                />
                <Label htmlFor={`ing2-${idx}`}>{r.ingredient}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="w-28"
                  type="number"
                  value={qty[r.ingredient] || 0}
                  onChange={e => setQty(prev => ({ ...prev, [r.ingredient]: Number.parseInt(e.target.value || "0", 10) }))}
                />
                <span className="text-sm opacity-70">g</span>
              </div>
            </div>
          ))}
          <div className="text-right text-sm">
            作成量 合計：<span className="font-semibold">{grams(sum)}</span>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>結果</Label>
            <Select value={outcome} onValueChange={(value: "used" | "extra") => setOutcome(value)}>
              <SelectTrigger>
                <SelectValue placeholder="選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="used">使い切った</SelectItem>
                <SelectItem value="extra">余った</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {outcome === "extra" && (
            <>
              <div>
                <Label>保管場所</Label>
                <Select value={leftLoc} onValueChange={setLeftLoc}>
                  <SelectTrigger disabled={mastersLoading || locations.length === 0}>
                    <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.length
                      ? locations.map(l => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))
                      : selectFallback(mastersLoading)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>余り数量（g）</Label>
                <Input
                  type="number"
                  value={leftG}
                  onChange={e => setLeftG(Number.parseInt(e.target.value || "0", 10))}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button
            disabled={
              sum <= 0 ||
              !manufacturedAt ||
              submitting ||
              (useType === "oem" && !oemPartner) ||
              (outcome === "extra" && (!leftLoc || leftG <= 0)) ||
              outcome === ""
            }
            onClick={submit}
          >
            登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StorageCardView({
  agg,
  findFlavor,
  calcExpiry,
  factoryCode,
}: {
  agg: StorageAggEntry;
  findFlavor: (id: string) => FlavorWithRecipe;
  calcExpiry: (manufacturedAt: string, flavorId: string) => string;
  factoryCode: string;
}) {
  const [useOpen, setUseOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [useQty, setUseQty] = useState(0);
  const [useOutcome, setUseOutcome] = useState<"extra" | "none" | "shortage" | "">("");
  const [leftQty, setLeftQty] = useState(0);
  const [loc, setLoc] = useState<string>(agg.locations[0] || "");
  const [wasteReason, setWasteReason] = useState<"expiry" | "mistake" | "other" | "">("");
  const [wasteQty, setWasteQty] = useState(0);
  const [wasteText, setWasteText] = useState("");
  const [useLoading, setUseLoading] = useState(false);
  const [wasteLoading, setWasteLoading] = useState(false);
  const flavor = findFlavor(agg.flavorId);
  const expiry = calcExpiry(agg.manufacturedAt, agg.flavorId);

  useEffect(() => {
    if (useOpen) {
      setUseQty(0);
      setUseOutcome("");
      setLeftQty(0);
      setLoc(agg.locations[0] || "");
    }
  }, [useOpen, agg.locations]);

  useEffect(() => {
    if (wasteOpen) {
      setWasteReason("");
      setWasteQty(0);
      setWasteText("");
      setLoc(agg.locations[0] || "");
    }
  }, [wasteOpen, agg.locations]);

  const effectiveLocation = (current: string) => current || agg.locations[0] || "";

  const handleUse = async () => {
    const location = effectiveLocation(loc);
    if (!location || useQty <= 0) return;
    try {
      setUseLoading(true);
      await apiPost("action", {
        type: "USE",
        factory_code: factoryCode,
        lot_id: agg.lotId,
        flavor_id: agg.flavorId,
        payload: {
          qty: useQty,
          location,
          result: useOutcome || null,
          leftover:
            useOutcome === "extra" && leftQty > 0
              ? { grams: leftQty, location }
              : null,
        },
      });
      await mutate(["storage-agg", factoryCode]);
      setUseOpen(false);
    } catch (error) {
      console.error(error);
      alert("通信に失敗しました");
    } finally {
      setUseLoading(false);
    }
  };

  const handleWaste = async () => {
    const location = effectiveLocation(loc);
    if (!location) return;
    if (wasteReason === "" || (wasteReason !== "other" && wasteQty <= 0)) return;
    try {
      setWasteLoading(true);
      await apiPost("action", {
        type: "WASTE",
        factory_code: factoryCode,
        lot_id: agg.lotId,
        flavor_id: agg.flavorId,
        payload:
          wasteReason === "other"
            ? { reason: "other", note: wasteText, location }
            : { reason: wasteReason, qty: wasteQty, location },
      });
      await mutate(["storage-agg", factoryCode]);
      setWasteOpen(false);
    } catch (error) {
      console.error(error);
      alert("通信に失敗しました");
    } finally {
      setWasteLoading(false);
    }
  };

  return (
    <Card className="border rounded-xl">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">{agg.lotId}</div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="味付け">{flavor?.flavorName || "-"}</Field>
          <Field label="保管場所">{agg.locations.join(" / ") || "-"}</Field>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="製造日">{agg.manufacturedAt || "-"}</Field>
          <Field label="賞味期限">{expiry}</Field>
          <Field label="合計">
            <span className="font-semibold">{grams(agg.grams)}</span>
          </Field>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setUseOpen(true)}>使う</Button>
          <Button variant="destructive" onClick={() => setWasteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />廃棄
          </Button>
        </div>
      </CardContent>
      <Dialog open={useOpen} onOpenChange={setUseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>在庫の使用</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>使用量（g）</Label>
                <Input
                  type="number"
                  value={useQty}
                  onChange={e => setUseQty(Number.parseInt(e.target.value || "0", 10))}
                />
              </div>
              <div>
                <Label>結果</Label>
                <Select value={useOutcome} onValueChange={(value: "extra" | "none" | "shortage") => setUseOutcome(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extra">余った</SelectItem>
                    <SelectItem value="none">余らず</SelectItem>
                    <SelectItem value="shortage">不足</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {useOutcome === "extra" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>余り数量（g）</Label>
                  <Input
                    type="number"
                    value={leftQty}
                    onChange={e => setLeftQty(Number.parseInt(e.target.value || "0", 10))}
                  />
                </div>
                <div>
                  <Label>保管場所</Label>
                  <Select value={loc} onValueChange={setLoc}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {agg.locations.map(l => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUseOpen(false)}>キャンセル</Button>
            <Button
              disabled={
                useLoading ||
                useQty <= 0 ||
                (useOutcome === "extra" && (leftQty <= 0 || !effectiveLocation(loc)))
              }
              onClick={handleUse}
            >
              登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={wasteOpen} onOpenChange={setWasteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>廃棄記録</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>理由</Label>
              <Select value={wasteReason} onValueChange={(value: "expiry" | "mistake" | "other") => setWasteReason(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expiry">賞味期限</SelectItem>
                  <SelectItem value="mistake">製造ミス</SelectItem>
                  <SelectItem value="other">その他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(wasteReason === "expiry" || wasteReason === "mistake") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>廃棄量（g）</Label>
                  <Input
                    type="number"
                    value={wasteQty}
                    onChange={e => setWasteQty(Number.parseInt(e.target.value || "0", 10))}
                  />
                </div>
                <div>
                  <Label>保管場所</Label>
                  <Select value={loc} onValueChange={setLoc}>
                    <SelectTrigger>
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {agg.locations.map(l => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {wasteReason === "other" && (
              <div>
                <Label>理由（自由記述）</Label>
                <Input value={wasteText} onChange={e => setWasteText(e.target.value)} placeholder="例）サンプル提供など" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setWasteOpen(false)}>キャンセル</Button>
            <Button
              disabled={
                wasteLoading ||
                wasteReason === "" ||
                ((wasteReason === "expiry" || wasteReason === "mistake") && (wasteQty <= 0 || !effectiveLocation(loc))) ||
                (wasteReason === "other" && wasteText.trim() === "")
              }
              onClick={handleWaste}
            >
              登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
