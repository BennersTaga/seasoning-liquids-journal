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

type MaterialLine = {
  ingredient_id?: string;
  ingredient_name: string;
  reported_qty: number;
  unit?: string;
  store_location?: string;
  source?: "entered";
};

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
  packsRemaining?: number;
  requiredGrams: number;
  useType: "fissule" | "oem";
  useCode?: string;
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
  packsEquiv?: number;
  locations: string[];
  manufacturedAt: string;
}

type MadeReport = {
  packs: number;
  grams: number;
  manufacturedAt: string;
  result: "extra" | "used";
  leftover?: { location: string; grams: number } | null;
  materials?: MaterialLine[];
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

const formatNumber = (n: number) => n.toLocaleString();
const formatGram = (n: number) => `${formatNumber(n)} g`;
const formatPacks = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const genId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
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

  const uses =
    masters?.uses?.map(u => ({
      code: u.use_code,
      name: u.use_name,
      type: u.use_type,
    })) ?? [];

  const allowedByUse: Record<string, Set<string>> = {};
  masters?.use_flavors?.forEach(row => {
    if (!allowedByUse[row.use_code]) {
      allowedByUse[row.use_code] = new Set();
    }
    allowedByUse[row.use_code].add(row.flavor_id);
  });

  return { factories, storageByFactory, flavors, oemList, uses, allowedByUse };
}

function normalizeOrders(rows?: OrderRow[]): OrderCard[] {
  if (!rows?.length) return [];
  const map = new Map<string, OrderCard>();

  rows.forEach(row => {
    const useTypeRaw = String(row.use_type ?? "").trim().toLowerCase();
    const isOem = useTypeRaw === "oem";

    const packsNum = Number(row.packs);
    const packsRemainingNum = Number(row.packs_remaining);
    const requiredGramsNum = Number(row.required_grams);

    const line: OrderLine = isOem
      ? {
          flavorId: row.flavor_id,
          packs: 0,
          requiredGrams: Number.isFinite(requiredGramsNum) ? requiredGramsNum : 0,
          useType: "oem",
          useCode: row.use_code ?? undefined,
          oemPartner: row.oem_partner ?? undefined,
          oemGrams: Number.isFinite(requiredGramsNum) ? requiredGramsNum : 0,
        }
      : {
          flavorId: row.flavor_id,
          packs: Number.isFinite(packsNum) ? packsNum : 0,
          packsRemaining: Number.isFinite(packsRemainingNum)
            ? packsRemainingNum
            : Number.isFinite(packsNum)
              ? packsNum
              : 0,
          requiredGrams: Number.isFinite(requiredGramsNum) ? requiredGramsNum : 0,
          useType: "fissule",
          useCode: row.use_code ?? undefined,
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
      packsEquiv: row.packs_equiv ?? undefined,
      locations: row.locations ?? [],
      manufacturedAt: row.manufactured_at,
    }))
    .filter(entry => Math.abs(entry.grams) > 0);
}

/* ===== メイン App ===== */

export default function App() {
  const [tab, setTab] = useState("office");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [onsiteBusy, setOnsiteBusy] = useState(false);
  const onsiteRequestIdRef = useRef<string | null>(null);
  const mastersQuery = useMasters();
  const mastersData = mastersQuery.data;
  const mastersLoading = mastersQuery.isLoading || (!mastersData && !mastersQuery.error);

  const clearError = useCallback(() => setErrorMessage(null), []);
  const reportError = useCallback((error: unknown, requestId: string) => {
    const message =
      error instanceof Error && error.message ? error.message : "通信に失敗しました";
    setErrorMessage(`${message} (request_id: ${requestId})`);
  }, []);

  const { factories, storageByFactory, flavors, oemList, uses, allowedByUse } = useMemo(
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
      if (onsiteBusy) return;
      if (!factoryCode || !flavorId || !manufacturedAt || producedG <= 0) {
        return;
      }
      if (!onsiteRequestIdRef.current) {
        onsiteRequestIdRef.current = genId();
      }
      const requestId = onsiteRequestIdRef.current as string;
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
        setOnsiteBusy(true);
        clearError();
        await apiPost("onsite-make", payload, { requestId });
        await Promise.all([
          mutate(["orders", factoryCode, false]),
          mutate(["storage-agg", factoryCode]),
        ]);
        onsiteRequestIdRef.current = null;
      } catch (error) {
        console.error(error);
        reportError(error, requestId);
        await Promise.all([
          mutate(["orders", factoryCode, false]),
          mutate(["storage-agg", factoryCode]),
        ]);
        throw error;
      } finally {
        setOnsiteBusy(false);
      }
    },
    [onsiteBusy, clearError, reportError],
  );

  return (
    <div className="min-h-screen bg-orange-50 p-6 mx-auto max-w-7xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">調味液日報 UI プロトタイプ</h1>
        <div className="text-sm opacity-80">タブで「オフィス / 現場」を切替</div>
      </header>
      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList className="grid w-full grid-cols-2 md:w-96">
            <TabsTrigger value="office" className="flex gap-2">
              <Factory className="h-4 w-4" />オフィス（5F/管理）
            </TabsTrigger>
            <TabsTrigger value="floor" className="flex gap-2">
              <Boxes className="h-4 w-4" />現場（フロア）
            </TabsTrigger>
          </TabsList>
          <div className="h-9" />
        </div>
        <TabsContent value="office" className="mt-6">
          <Office
            factories={factories}
            flavors={flavors}
            oemList={oemList}
            findFlavor={findFlavor}
            mastersLoading={mastersLoading}
            uses={uses}
            allowedByUse={allowedByUse}
            onRequestError={reportError}
            onRequestSuccess={clearError}
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
            registerBusy={onsiteBusy}
            mastersLoading={mastersLoading}
            uses={uses}
            onRequestError={reportError}
            onRequestSuccess={clearError}
          />
        </TabsContent>
      </Tabs>
      <footer className="text-xs text-center text-muted-foreground opacity-70">GAS 連携バージョン</footer>
    </div>
  );
}

/* ===== Office タブ ===== */

function Office({
  factories,
  flavors,
  oemList,
  findFlavor,
  mastersLoading,
  uses,
  allowedByUse,
  onRequestError,
  onRequestSuccess,
}: {
  factories: { code: string; name: string }[];
  flavors: FlavorWithRecipe[];
  oemList: string[];
  findFlavor: (id: string) => FlavorWithRecipe;
  mastersLoading: boolean;
  uses: { code: string; name: string; type: "fissule" | "oem" }[];
  allowedByUse: Record<string, Set<string>>;
  onRequestError: (error: unknown, requestId: string) => void;
  onRequestSuccess: () => void;
}) {
  const [factory, setFactory] = useState(factories[0]?.code ?? "");
  const [flavor, setFlavor] = useState(flavors[0]?.id ?? "");
  const [useCode, setUseCode] = useState(uses[0]?.code ?? "");
  const [packs, setPacks] = useState(100);
  const [oemPartner, setOemPartner] = useState(oemList[0] ?? "");
  const [oemGrams, setOemGrams] = useState(0);
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const seqRef = useRef<Record<string, number>>({});
  const selectedUse = useMemo(
    () => uses.find(u => u.code === useCode),
    [uses, useCode],
  );
  const derivedUseType: "fissule" | "oem" = selectedUse?.type === "oem" ? "oem" : "fissule";
  const allowedSet = useMemo(() => allowedByUse[useCode], [allowedByUse, useCode]);
  const flavorOptions = useMemo(() => {
    if (allowedSet && allowedSet.size > 0) {
      return flavors.filter(fl => allowedSet.has(fl.id));
    }
    return flavors;
  }, [allowedSet, flavors]);
  const purposeLabelByCode = useMemo(() => {
    const map: Record<string, string> = {};
    uses.forEach(u => {
      map[u.code] = u.name;
    });
    return map;
  }, [uses]);
  const factoryDisabled = mastersLoading || factories.length === 0;
  const purposeDisabled = mastersLoading || uses.length === 0;
  const flavorDisabled = mastersLoading || flavorOptions.length === 0;
  const oemDisabled = mastersLoading || oemList.length === 0;

  useEffect(() => {
    if (factories.length && !factories.some(f => f.code === factory)) {
      setFactory(factories[0].code);
    }
  }, [factories, factory]);

  useEffect(() => {
    if (!uses.length) {
      if (useCode !== "") {
        setUseCode("");
      }
      return;
    }
    if (!useCode || !uses.some(u => u.code === useCode)) {
      setUseCode(uses[0].code);
    }
  }, [uses, useCode]);

  useEffect(() => {
    if (!flavorOptions.length) {
      if (flavor !== "") {
        setFlavor("");
      }
      return;
    }
    if (!flavorOptions.some(fl => fl.id === flavor)) {
      setFlavor(flavorOptions[0].id);
    }
  }, [flavorOptions, flavor]);

  useEffect(() => {
    if (oemList.length && !oemList.includes(oemPartner)) {
      setOemPartner(oemList[0]);
    }
  }, [oemList, oemPartner]);

  const ordersQuery = useOrders(factory || undefined, false);
  const orderCards = useMemo(() => normalizeOrders(ordersQuery.data), [ordersQuery.data]);
  const openOrders = useMemo(() => orderCards.filter(order => !order.archived), [orderCards]);
  const storageAggQuery = useStorageAgg(factory || undefined);
  const storageAgg = useMemo(() => normalizeStorage(storageAggQuery.data), [storageAggQuery.data]);

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
    if (busy) return;
    if (!factory || !flavor || !useCode) return;
    if (derivedUseType === "fissule" && packs <= 0) return;
    if (derivedUseType === "oem" && (!oemPartner || oemGrams <= 0)) return;
    if (!requestIdRef.current) {
      requestIdRef.current = genId();
    }
    const requestId = requestIdRef.current as string;
    const today = new Date();
    const dateSegment = format(today, "yyyyMMdd");
    const key = `${factory}-${dateSegment}`;
    const seq = seqRef.current[key] ?? 1;
    const lotId = genLotId(factory, seq, today);
    const orderedAt = format(today, "yyyy-MM-dd");
    const body =
      derivedUseType === "fissule"
        ? {
            factory_code: factory,
            lot_id: lotId,
            ordered_at: orderedAt,
            flavor_id: flavor,
            use_type: "fissule" as const,
            use_code: useCode,
            packs,
            required_grams: packs * (findFlavor(flavor)?.packToGram ?? 0),
            oem_partner: "",
            archived: false,
          }
        : {
            factory_code: factory,
            lot_id: lotId,
            ordered_at: orderedAt,
            flavor_id: flavor,
            use_type: "oem" as const,
            use_code: useCode,
            packs: 0,
            required_grams: oemGrams,
            oem_partner: oemPartner ?? "",
            archived: false,
          };
    try {
      setBusy(true);
      onRequestSuccess();
      const resp = await apiPost<{ ok?: boolean }>("orders-create", body, {
        requestId,
        // timeoutMs は渡さない（既定90s）
      });
      if (!resp?.ok) {
        throw new Error(JSON.stringify(resp));
      }
      seqRef.current[key] = seq + 1;
      await mutate(["orders", factory, false]);
      requestIdRef.current = null;
      onRequestSuccess();
    } catch (error) {
      console.error(error);
      onRequestError(error, requestId);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    factory,
    flavor,
    useCode,
    derivedUseType,
    packs,
    oemPartner,
    oemGrams,
    findFlavor,
    onRequestSuccess,
    onRequestError,
  ]);

  return (
    <div className="grid md:grid-cols-3 gap-6 items-start">
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
              <SelectTrigger
                disabled={factoryDisabled}
                className="w-full text-left h-auto min-h-[44px] py-2 whitespace-normal break-words"
              >
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
          <div>
            <Label>用途</Label>
            <Select value={useCode} onValueChange={setUseCode}>
              <SelectTrigger
                disabled={purposeDisabled}
                className="w-full text-left h-auto min-h-[44px] py-2 whitespace-normal break-words"
              >
                <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
              </SelectTrigger>
              <SelectContent>
                {uses.length
                  ? uses.map(u => (
                      <SelectItem key={u.code} value={u.code}>
                        {u.name}
                      </SelectItem>
                    ))
                  : selectFallback(mastersLoading)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>味付け</Label>
            <Select value={flavor} onValueChange={setFlavor}>
              <SelectTrigger
                disabled={flavorDisabled}
                className="w-full text-left h-auto min-h-[44px] py-2 whitespace-normal break-words"
              >
                <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
              </SelectTrigger>
              <SelectContent>
                {flavorOptions.length
                  ? flavorOptions.map(fl => (
                      <SelectItem key={fl.id} value={fl.id}>
                        {fl.flavorName}
                      </SelectItem>
                    ))
                  : selectFallback(mastersLoading)}
              </SelectContent>
            </Select>
          </div>
          {derivedUseType === "fissule" ? (
            <div>
              <Label>パック数</Label>
              <Input
                type="number"
                value={packs}
                onChange={e => setPacks(Number.parseInt(e.target.value || "0", 10))}
                className="w-full"
              />
              <div className="text-xs text-muted-foreground mt-1">
                必要量: {formatGram(packs * (findFlavor(flavor)?.packToGram ?? 0))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label>OEM先</Label>
                <Select value={oemPartner} onValueChange={setOemPartner}>
                  <SelectTrigger
                    disabled={oemDisabled}
                    className="w-full text-left h-auto min-h-[44px] py-2 whitespace-normal break-words"
                  >
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
              <div>
                <Label>作成グラム数（g）</Label>
                <Input
                  type="number"
                  value={oemGrams}
                  onChange={e => setOemGrams(Number.parseInt(e.target.value || "0", 10))}
                  className="w-full"
                />
              </div>
            </>
          )}
          <div className="flex gap-3">
            <Button onClick={createOrder} disabled={busy}>
              チケットを登録
            </Button>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Beaker className="h-4 w-4" />
              <span>パック→g は味付け設定で自動換算</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <KanbanColumn title="保管（在庫）" icon={<Warehouse className="h-4 w-4" />}>
        {storageAgg.map(agg => (
          <StorageCardView
            key={agg.lotId}
            agg={agg}
            findFlavor={findFlavor}
            calcExpiry={calcExpiry}
            factoryCode={factory}
            onRequestError={onRequestError}
            onRequestSuccess={onRequestSuccess}
          />
        ))}
        {storageAgg.length === 0 && <Empty>余剰の在庫はここに集計されます</Empty>}
      </KanbanColumn>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />製造指示
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
                      <Field label="用途">
                        {(() => {
                          const label = ln.useCode ? purposeLabelByCode[ln.useCode] ?? ln.useCode : undefined;
                          const typeLabel = ln.useType === "oem" ? "OEM" : "製品";
                          return label ? `${label}（${typeLabel}）` : typeLabel;
                        })()}
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label={ln.useType === "fissule" ? "残りパック数" : "OEM先"}>
                        {ln.useType === "fissule"
                          ? formatPacks(ln.packsRemaining ?? ln.packs ?? 0)
                          : ln.oemPartner ?? "-"}
                      </Field>
                      <Field label="必要量">
                        <span className="font-semibold">{formatGram(ln.requiredGrams)}</span>
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

/* ===== Floor タブ ===== */

function Floor({
  factories,
  flavors,
  findFlavor,
  storageByFactory,
  oemList,
  calcExpiry,
  registerOnsiteMake,
  registerBusy,
  mastersLoading,
  uses,
  onRequestError,
  onRequestSuccess,
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
  registerBusy: boolean;
  mastersLoading: boolean;
  uses: { code: string; name: string; type: "fissule" | "oem" }[];
  onRequestError: (error: unknown, requestId: string) => void;
  onRequestSuccess: () => void;
}) {
  const [factory, setFactory] = useState(factories[0]?.code ?? "");
  const [extraOpen, setExtraOpen] = useState(false);
  const factoryDisabled = mastersLoading || factories.length === 0;
  const [keepBusy, setKeepBusy] = useState(false);
  const keepRequestIdRef = useRef<string | null>(null);
  const [madeBusy, setMadeBusy] = useState(false);
  const madeRequestIdRef = useRef<string | null>(null);

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

  const purposeLabelByCode = useMemo(() => {
    const map: Record<string, string> = {};
    uses.forEach(u => {
      map[u.code] = u.name;
    });
    return map;
  }, [uses]);

  const openOrders = useMemo(
    () => orders.filter(order => !order.archived && order.factoryCode === factory),
    [orders, factory],
  );

  const handleKeep = useCallback(
    async (order: OrderCard, values: KeepFormValues) => {
      if (keepBusy) return;
      const line = order.lines[0];
      if (!keepRequestIdRef.current) {
        keepRequestIdRef.current = genId();
      }
      const requestId = keepRequestIdRef.current as string;
      try {
        setKeepBusy(true);
        onRequestSuccess();
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
        }, { requestId });
        await Promise.all([
          mutate(["storage-agg", order.factoryCode]),
          mutate(["orders", order.factoryCode, false]),
        ]);
        keepRequestIdRef.current = null;
        onRequestSuccess();
      } catch (error) {
        console.error(error);
        onRequestError(error, requestId);
        throw error;
      } finally {
        setKeepBusy(false);
      }
    },
    [keepBusy, onRequestError, onRequestSuccess],
  );

  const handleReportMade = useCallback(
    async (order: OrderCard, report: MadeReport) => {
      if (madeBusy) return;
      const line = order.lines[0];
      const leftoverPayload = report.leftover && report.leftover.grams > 0
        ? { location: report.leftover.location, grams: report.leftover.grams }
        : null;
      const materialsPayload = (report.materials ?? []).map(m => ({
        ingredient_id: m.ingredient_id ?? "",
        ingredient_name: m.ingredient_name,
        reported_qty: Number(m.reported_qty),
        unit: m.unit ?? "g",
        store_location: m.store_location ?? "",
        source: "entered" as const,
      }));
      const basePayload = {
        packs: Math.max(0, report.packs),
        grams: report.grams,
        manufactured_at: report.manufacturedAt,
        result: report.result,
        leftover: leftoverPayload,
      };
      const finalPayload = materialsPayload.length
        ? { ...basePayload, materials: materialsPayload }
        : basePayload;
      if (!madeRequestIdRef.current) {
        madeRequestIdRef.current = genId();
      }
      const requestId = madeRequestIdRef.current as string;
      try {
        setMadeBusy(true);
        onRequestSuccess();
        await apiPost("action", {
          type: "MADE_SPLIT",
          factory_code: order.factoryCode,
          lot_id: order.lotId,
          flavor_id: line.flavorId,
          payload: finalPayload,
        }, { requestId });
        await Promise.all([
          mutate(["orders", order.factoryCode, false]),
          mutate(["storage-agg", order.factoryCode]),
        ]);
        madeRequestIdRef.current = null;
        onRequestSuccess();
      } catch (error) {
        console.error(error);
        onRequestError(error, requestId);
        throw error;
      } finally {
        setMadeBusy(false);
      }
    },
    [madeBusy, onRequestError, onRequestSuccess],
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
              remainingPacks={Math.max(
                0,
                order.lines[0]?.packsRemaining ?? order.lines[0]?.packs ?? 0,
              )}
              onKeep={values => handleKeep(order, values)}
              onReportMade={report => handleReportMade(order, report)}
              findFlavor={findFlavor}
              storageByFactory={storageByFactory}
              mastersLoading={mastersLoading}
              purposeLabelByCode={purposeLabelByCode}
              keepBusy={keepBusy}
              reportBusy={madeBusy}
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
              onRequestError={onRequestError}
              onRequestSuccess={onRequestSuccess}
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
        busy={registerBusy}
        flavors={flavors}
        oemList={oemList}
        findFlavor={findFlavor}
        storageByFactory={storageByFactory}
        mastersLoading={mastersLoading}
      />
    </div>
  );
}

/* ===== 共通 UI ===== */

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

/* ===== 各種ダイアログ/カード ===== */

function OrderCardView({
  order,
  remainingPacks,
  onKeep,
  onReportMade,
  findFlavor,
  storageByFactory,
  mastersLoading,
  purposeLabelByCode,
  keepBusy,
  reportBusy,
}: {
  order: OrderCard;
  remainingPacks: number;
  onKeep: (values: KeepFormValues) => Promise<void>;
  onReportMade: (report: MadeReport) => Promise<void>;
  findFlavor: (id: string) => FlavorWithRecipe;
  storageByFactory: Record<string, string[]>;
  mastersLoading: boolean;
  purposeLabelByCode: Record<string, string>;
  keepBusy: boolean;
  reportBusy: boolean;
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
            <Field label="用途">
              {(() => {
                const label = line.useCode ? purposeLabelByCode[line.useCode] ?? line.useCode : "-";
                return label;
              })()}
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={line.useType === "fissule" ? "残りパック数" : "OEM先"}>
              {line.useType === "fissule"
                ? formatPacks(remainingPacks)
                : line.oemPartner ?? "-"}
            </Field>
            <Field label="必要量">
              <span className="font-semibold">{formatGram(line.requiredGrams ?? 0)}</span>
            </Field>
          </div>
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
        busy={keepBusy}
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
        busy={reportBusy}
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
        busy={reportBusy}
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
  busy,
}: {
  open: boolean;
  onClose: () => void;
  factoryCode: string;
  storageByFactory: Record<string, string[]>;
  onSubmit: (values: KeepFormValues) => Promise<void>;
  mastersLoading: boolean;
  busy: boolean;
}) {
  const [loc, setLoc] = useState("");
  const [gramsValue, setGramsValue] = useState(0);
  const [manufacturedAt, setManufacturedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const locations = storageByFactory[factoryCode] || [];

  useEffect(() => {
    if (open) {
      setLoc("");
      setGramsValue(0);
      setManufacturedAt(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open]);

  const handleSubmit = async () => {
    if (busy || !loc || gramsValue <= 0 || !manufacturedAt) return;
    try {
      await onSubmit({ location: loc, grams: gramsValue, manufacturedAt });
      onClose();
    } catch {
      // keep dialog open
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
          <Button
            disabled={busy || !loc || gramsValue <= 0 || !manufacturedAt}
            onClick={handleSubmit}
          >
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
  busy,
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
  busy: boolean;
}) {
  // 復活：チェックボックス＋目安＋初期値
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reported, setReported] = useState<Record<string, string>>({});
  const [expected, setExpected] = useState<Record<string, number>>({});
  const [manufacturedAt, setManufacturedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [outcome, setOutcome] = useState<"extra" | "used" | "">("");
  const [leftLoc, setLeftLoc] = useState("");
  const [leftGrams, setLeftGrams] = useState(0);
  const [packsMade, setPacksMade] = useState(0);
  const line = order.lines[0];
  const flavor = findFlavor(line.flavorId);
  const showPackInput = line.useType === "fissule" && (line.packs || 0) > 0;
  const locations = storageByFactory[order.factoryCode] || [];

  useEffect(() => {
    if (open) {
      setChecked({});
      setReported({});
      setExpected({});
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

  const tooMuch = showPackInput && packsMade > Math.max(0, remaining);

  const grams = showPackInput
    ? packsMade * (flavor.packToGram ?? 0)
    : line.oemGrams ?? line.requiredGrams;

  // 目安（理論値）と reported の初期値を作成量から按分して計算
  useEffect(() => {
    if (!open) return;
    const sum = flavor.recipe.reduce((total, r) => total + (r.qty || 0), 0);
    const exp: Record<string, number> = {};
    const initChecked: Record<string, boolean> = {};
    const initReported: Record<string, string> = {};
    flavor.recipe.forEach(r => {
      const key = r.ingredient;
      const value = sum > 0 ? Math.round(grams * ((r.qty || 0) / sum)) : 0;
      exp[key] = value;
      // 初期状態：未チェック（現場が意識的にチェックを入れる）
      initChecked[key] = false;
      initReported[key] = value > 0 ? String(value) : "";
    });
    setExpected(exp);
    setChecked(initChecked);
    setReported(initReported);
  }, [open, flavor.recipe, grams]);

  const submit = async () => {
    if (busy) return;
    if (showPackInput && (packsMade <= 0 || tooMuch)) return;
    if (outcome !== "extra" && outcome !== "used") return;
    const packsValue = showPackInput ? packsMade : 0;
    const gramsValue = grams;
    const leftoverPayload =
      outcome === "extra" && leftGrams > 0 && leftLoc
        ? { location: leftLoc, grams: leftGrams }
        : null;

    // checked かつ >0 の行のみ採用。null は返さず型ガードで MaterialLine[] に。
    const materials: MaterialLine[] = flavor.recipe
      .map((r): MaterialLine | null => {
        const key = r.ingredient;
        if (!checked[key]) return null;
        const raw = reported[key] ?? "";
        const n = Number.parseFloat(String(raw).replace(/,/g, ""));
        if (!Number.isFinite(n) || n <= 0) return null;
        return {
          ingredient_id: "",
          ingredient_name: key,
          reported_qty: n,
          unit: "g",
          store_location: "",
          source: "entered",
        };
      })
      .filter((m): m is MaterialLine => m !== null);

    try {
      await onReport({
        packs: packsValue,
        grams: gramsValue,
        manufacturedAt,
        result: outcome,
        leftover: leftoverPayload,
        materials,
      });
      onClose();
    } catch {
      // keep dialog open
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
          {flavor.recipe.map(r => {
            const key = r.ingredient;
            return (
              <div key={key} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={!!checked[key]}
                    onCheckedChange={value =>
                      setChecked(prev => ({
                        ...prev,
                        [key]: Boolean(value),
                      }))
                    }
                  />
                  <div>
                    <div className="text-sm font-medium">{key}</div>
                    <div className="text-xs text-muted-foreground">
                      目安 {expected[key]?.toLocaleString?.() ?? 0} g
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="w-28 text-right"
                    type="number"
                    inputMode="decimal"
                    disabled={!checked[key]}
                    value={reported[key] ?? ""}
                    onChange={e => {
                      const raw = e.target.value ?? "";
                      setReported(prev => ({
                        ...prev,
                        [key]: raw,
                      }));
                    }}
                  />
                  <span className="text-sm text-muted-foreground">g</span>
                </div>
              </div>
            );
          })}
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
            {line.useType === "oem" && <Field label="作成量">{formatGram(line.oemGrams || line.requiredGrams)}</Field>}
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
              busy ||
              !manufacturedAt ||
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
  busy,
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
  busy: boolean;
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
  const flavor = findFlavor(flavorId);
  const sum = Object.keys(qty).reduce((acc, key) => acc + (checked[key] ? qty[key] || 0 : 0), 0);
  const flavorDisabled = mastersLoading || flavors.length === 0;
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
    if (busy) return;
    const leftover = outcome === "extra" && leftLoc && leftG > 0 ? { loc: leftLoc, grams: leftG } : undefined;
    try {
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
            作成量 合計：<span className="font-semibold">{formatGram(sum)}</span>
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
              busy ||
              sum <= 0 ||
              !manufacturedAt ||
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
  onRequestError,
  onRequestSuccess,
}: {
  agg: StorageAggEntry;
  findFlavor: (id: string) => FlavorWithRecipe;
  calcExpiry: (manufacturedAt: string, flavorId: string) => string;
  factoryCode: string;
  onRequestError: (error: unknown, requestId: string) => void;
  onRequestSuccess: () => void;
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
  const [useBusy, setUseBusy] = useState(false);
  const [wasteBusy, setWasteBusy] = useState(false);
  const useRequestIdRef = useRef<string | null>(null);
  const wasteRequestIdRef = useRef<string | null>(null);
  const [currentGrams, setCurrentGrams] = useState(agg.grams);
  const [currentPacksEquiv, setCurrentPacksEquiv] = useState<number | undefined>(agg.packsEquiv);
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

  useEffect(() => {
    setCurrentGrams(agg.grams);
    setCurrentPacksEquiv(agg.packsEquiv);
  }, [agg.grams, agg.packsEquiv]);

  const effectiveLocation = (current: string) => current || agg.locations[0] || "";

  const handleUse = async () => {
    if (useBusy) return;
    const location = effectiveLocation(loc);
    if (!location || useQty <= 0) return;
    if (!useRequestIdRef.current) {
      useRequestIdRef.current = genId();
    }
    const requestId = useRequestIdRef.current as string;
    try {
      setUseBusy(true);
      onRequestSuccess();
      const resp = await apiPost<{
        storage_after?: { grams: number; packs_equiv?: number | null };
      }>("action", {
        type: "USE",
        factory_code: factoryCode,
        lot_id: agg.lotId,
        flavor_id: agg.flavorId,
        payload: {
          grams: useQty,
          location,
          result: useOutcome || "used",
          leftover:
            useOutcome === "extra" && leftQty > 0
              ? { grams: leftQty, location }
              : null,
        },
      }, { requestId });
      await Promise.all([
        mutate(["storage-agg", factoryCode], undefined, { revalidate: true }),
        mutate(["orders", factoryCode, false], undefined, { revalidate: true }),
      ]);
      if (resp?.storage_after) {
        setCurrentGrams(resp.storage_after.grams);
        setCurrentPacksEquiv(resp.storage_after.packs_equiv ?? undefined);
      }
      useRequestIdRef.current = null;
      onRequestSuccess();
      setUseOpen(false);
    } catch (error) {
      console.error(error);
      onRequestError(error, requestId);
    } finally {
      setUseBusy(false);
    }
  };

  const handleWaste = async () => {
    if (wasteBusy) return;
    const location = effectiveLocation(loc);
    if (!location) return;
    if (wasteReason === "" || wasteQty <= 0) return;
    if (!wasteRequestIdRef.current) {
      wasteRequestIdRef.current = genId();
    }
    const requestId = wasteRequestIdRef.current as string;
    try {
      setWasteBusy(true);
      onRequestSuccess();
      const payload =
        wasteReason === "other"
          ? { reason: "other", note: wasteText, grams: wasteQty, qty: wasteQty, location }
          : { reason: wasteReason, grams: wasteQty, qty: wasteQty, location };

      const resp = await apiPost<{
        storage_after?: { grams: number; packs_equiv?: number | null };
      }>("action", {
        type: "WASTE",
        factory_code: factoryCode,
        lot_id: agg.lotId,
        flavor_id: agg.flavorId,
        payload,
      }, { requestId });

      await mutate(["storage-agg", factoryCode], undefined, { revalidate: true });
      if (resp?.storage_after) {
        setCurrentGrams(resp.storage_after.grams);
        setCurrentPacksEquiv(resp.storage_after.packs_equiv ?? undefined);
      }
      wasteRequestIdRef.current = null;
      onRequestSuccess();
      setWasteOpen(false);
    } catch (error) {
      console.error(error);
      onRequestError(error, requestId);
    } finally {
      setWasteBusy(false);
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
            <span className="font-semibold">{formatGram(currentGrams)}</span>
            {typeof currentPacksEquiv === "number" && (
              <span className="ml-1 text-sm text-muted-foreground">
                （約 {formatNumber(currentPacksEquiv)} パック）
              </span>
            )}
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
                useBusy ||
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
                wasteBusy ||
                wasteReason === "" ||
                wasteQty <= 0 ||
                !effectiveLocation(loc) ||
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
