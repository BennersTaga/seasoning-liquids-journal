'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Warehouse, Archive, Beaker, Factory, Trash2, Boxes } from "lucide-react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import useSWR, { mutate } from "swr";

import { apiPost, fetchMadeLog, type MadeLogRow } from "@/lib/gas";
import { useMasters } from "@/hooks/useMasters";
import { useOrders } from "@/hooks/useOrders";
import { useStorageAgg } from "@/hooks/useStorageAgg";
import {
  defaultFlavor,
  deriveDataFromMasters,
  formatGram,
  formatNumber,
  formatPacks,
  genId,
  genLotId,
  isChildLot,
  normalizeOrders,
  normalizeStorage,
  selectFallback,
  type FlavorWithRecipe,
  type OrderCard,
  type StorageAggEntry,
} from "./shared";

/* ===== メイン App ===== */

export default function App() {
  const [tab, setTab] = useState("office");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
            findFlavor={findFlavor}
            storageByFactory={storageByFactory}
            mastersLoading={mastersLoading}
            uses={uses}
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
  const [packsInput, setPacksInput] = useState("100");
  const [deadlineAt, setDeadlineAt] = useState(format(new Date(), "yyyy-MM-dd"));
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
  const quantityMode: "packs" | "grams" = useMemo(() => {
    const normalizedUseName = (selectedUse?.name ?? "").replace(/\s+/g, "");
    if (normalizedUseName === "OEM(送付分)") return "packs";
    if (normalizedUseName === "玄海丼(送付分)" || normalizedUseName === "玄海丼(製造分)") return "grams";
    return derivedUseType === "oem" ? "grams" : "packs";
  }, [derivedUseType, selectedUse?.name]);
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
    if (quantityMode === "packs" && packs <= 0) return;
    if (quantityMode === "grams" && oemGrams <= 0) return;
    if (derivedUseType === "oem" && !oemPartner) return;
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
    const packsValue = quantityMode === "packs" ? packs : 0;
    const requiredGrams =
      quantityMode === "packs" ? packs * (findFlavor(flavor)?.packToGram ?? 0) : oemGrams;
    const body =
      derivedUseType === "fissule"
        ? {
            factory_code: factory,
            lot_id: lotId,
            ordered_at: orderedAt,
            flavor_id: flavor,
            use_type: "fissule" as const,
            use_code: useCode,
            deadline_at: deadlineAt,
            packs: packsValue,
            required_grams: requiredGrams,
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
            deadline_at: deadlineAt,
            packs: packsValue,
            required_grams: requiredGrams,
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
    quantityMode,
    packs,
    oemPartner,
    oemGrams,
    deadlineAt,
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
          {derivedUseType === "oem" ? (
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
          ) : null}
          {quantityMode === "packs" ? (
            <div>
              <Label>パック数</Label>
              <Input
                type="number"
                value={packsInput}
                onChange={e => {
                  const v = e.target.value;
                  setPacksInput(v);
                  const n = Number.parseInt(v, 10);
                  setPacks(Number.isNaN(n) ? 0 : n);
                }}
                className="w-full"
              />
              <div className="text-xs text-muted-foreground mt-1">
                必要量: {formatGram(packs * (findFlavor(flavor)?.packToGram ?? 0))}
              </div>
            </div>
          ) : (
            <div>
              <Label>作成グラム数（g）</Label>
              <Input
                type="number"
                value={oemGrams}
                onChange={e => setOemGrams(Number.parseInt(e.target.value || "0", 10))}
                className="w-full"
              />
            </div>
          )}
          <div>
            <Label>製造締切日</Label>
            <Input
              type="date"
              value={deadlineAt}
              onChange={e => setDeadlineAt(e.target.value)}
              className="w-full"
            />
          </div>
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
  findFlavor,
  storageByFactory,
  mastersLoading,
  uses,
}: {
  factories: { code: string; name: string }[];
  findFlavor: (id: string) => FlavorWithRecipe;
  storageByFactory: Record<string, string[]>;
  mastersLoading: boolean;
  uses: { code: string; name: string; type: "fissule" | "oem" }[];
}) {
  const [factory, setFactory] = useState(factories[0]?.code ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const factoryDisabled = mastersLoading || factories.length === 0;
  const returnTo = useMemo(() => {
    const search = searchParams.toString();
    return `${pathname}${search ? `?${search}` : ""}`;
  }, [pathname, searchParams]);
  const seqRef = useRef<Record<string, number>>({});
  const { start: monthStartStr, end: monthEndStr } = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(start);
    return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
  }, []);

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
  const { data: madeLogData } = useSWR(
    factory ? ["made-log", factory, monthStartStr, monthEndStr] : null,
    ([, factoryCode, start, end]) =>
      fetchMadeLog({
        factory: factoryCode,
        start,
        end,
      }),
  );

  const orders = useMemo(
    () => normalizeOrders(ordersQuery.data),
    [ordersQuery.data],
  );

  const storageAgg = useMemo(
    () => normalizeStorage(storageAggQuery.data),
    [storageAggQuery.data],
  );

  const madeLogRows: MadeLogRow[] = useMemo(
    () => madeLogData?.rows ?? [],
    [madeLogData?.rows],
  );
  const visibleMadeLogRows = useMemo(
    () =>
      madeLogRows.filter(row => {
        const child = isChildLot(row.lot_id);
        return !(child && row.status === "全量使用");
      }),
    [madeLogRows],
  );

  useEffect(() => {
    const next = { ...seqRef.current };
    orders.forEach(order => {
      const lotId = order.lotId;
      if (!lotId) return;
      const match = /^([A-Z0-9]+)-(\d{8})-(\d+)$/.exec(lotId);
      if (!match) return;
      const [, factoryCode, datePart, suffix] = match;
      const numeric = Number.parseInt(suffix, 10);
      if (Number.isNaN(numeric)) return;
      const key = `${factoryCode}-${datePart}`;
      const candidate = numeric + 1;
      if (!next[key] || next[key] < candidate) {
        next[key] = candidate;
      }
    });
    seqRef.current = next;
  }, [orders]);

  const purposeLabelByCode = useMemo(() => {
    const map: Record<string, string> = {};
    uses.forEach(u => {
      map[u.code] = u.name;
    });
    return map;
  }, [uses]);

  return (
    <div className="min-h-screen bg-[#FFF4EA] p-6">
      <div className="mx-auto max-w-[1280px] space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">現場（フロア）— テーブル表示</h2>
          <div className="text-xs text-slate-500">既存API構造を流用したテーブルUI</div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-slate-600">製造場所</Label>
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
          <Button
            className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1 text-amber-800 shadow hover:bg-amber-200"
            onClick={() => {
              const params = new URLSearchParams();
              if (factory) params.set("factory", factory);
              params.set("return_to", returnTo || "/floor");
              router.push(`/actions/extra?${params.toString()}`);
            }}
            disabled={mastersLoading}
          >
            ＋ 追加で作成
          </Button>
        </div>

        <FloorTable
          orders={orders}
          storageAgg={storageAgg}
          purposeLabelByCode={purposeLabelByCode}
          findFlavor={findFlavor}
          storageByFactory={storageByFactory}
        />

        <section className="mt-8">
          <h2 className="text-base font-semibold mb-2">今月の製造実績</h2>
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">製造日</th>
                  <th className="px-4 py-3 text-left font-semibold">味付け</th>
                  <th className="px-4 py-3 text-left font-semibold">ロット</th>
                  <th className="px-4 py-3 text-right font-semibold">製造量</th>
                  <th className="px-4 py-3 text-left font-semibold">ステータス</th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-orange-50/40">
                {visibleMadeLogRows.map(row => (
                  <tr key={row.action_id}>
                    <td className="px-4 py-3 text-slate-700">{row.manufactured_at}</td>
                    <td className="px-4 py-3 text-slate-700">{row.flavor_name}</td>
                    <td className="px-4 py-3 text-slate-700">{row.lot_id}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {row.produced_grams.toLocaleString()} g
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
                {visibleMadeLogRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-slate-400"
                    >
                      表示できるデータがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="text-xs text-slate-500">UIのみのモック / 既存API構造前提</div>
      </div>
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

type FloorTableProps = {
  orders: OrderCard[];
  storageAgg: StorageAggEntry[];
  purposeLabelByCode: Record<string, string>;
  findFlavor: (flavorId: string) => FlavorWithRecipe | undefined;
  storageByFactory: Record<string, string[]>;
};

type StatusType = "指示" | "製造中" | "製造完了" | "保管中" | "全量使用";

const statusStyles: Record<StatusType, string> = {
  指示: "bg-slate-200 text-slate-700",
  製造中: "bg-blue-100 text-blue-700",
  製造完了: "bg-emerald-100 text-emerald-700",
  保管中: "bg-violet-100 text-violet-700",
  全量使用: "bg-slate-100 text-slate-500",
};

function StatusPill({ status }: { status: StatusType }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function QtyCell({ grams, packsLabel }: { grams?: number | null; packsLabel?: string }) {
  const gramText = Number.isFinite(grams as number) ? formatGram(grams ?? 0) : "-";
  return (
    <div className="leading-tight space-y-1">
      <div className="font-semibold">{gramText}</div>
      <div className="text-xs text-muted-foreground">{packsLabel ?? "-"}</div>
    </div>
  );
}

function FloorTable({
  orders,
  storageAgg,
  purposeLabelByCode,
  findFlavor,
  storageByFactory,
}: FloorTableProps) {
  const storageByParent = useMemo(() => {
    const map = new Map<string, StorageAggEntry[]>();

    storageAgg.forEach(entry => {
      const match = entry.lotId.match(/^([A-Z0-9]+-\d{8}-\d{3})(?:-(\d+))?$/);
      const parentLotId = match ? match[1] : entry.lotId;
      const key = `${parentLotId}-${entry.flavorId}`;
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    });

    return map;
  }, [storageAgg]);

  const activeOrders = useMemo(() => orders.filter(o => !o.archived), [orders]);

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1280px] text-sm">
          <thead className="sticky top-0 bg-amber-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">製造指示日</th>
              <th className="px-4 py-3 text-left font-semibold">製造締切日</th>
              <th className="px-4 py-3 text-left font-semibold">製造日</th>
              <th className="px-4 py-3 text-left font-semibold">味付け</th>
              <th className="px-4 py-3 text-left font-semibold">用途</th>
              <th className="px-4 py-3 text-left font-semibold">ステータス</th>
              <th className="px-4 py-3 text-left font-semibold">操作</th>
              <th className="px-4 py-3 text-left font-semibold text-right">製造すべき</th>
              <th className="px-4 py-3 text-left font-semibold text-right">製造した</th>
              <th className="px-4 py-3 text-left font-semibold text-right">余り</th>
              <th className="px-4 py-3 text-left font-semibold">保管場所</th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-orange-50/40">
            {activeOrders.map(order => {
              const line = order.lines[0];
              const key = `${order.lotId}-${line.flavorId}`;
              const storageEntriesForOrder = storageByParent.get(key) ?? [];
              const mainStorageEntry = storageEntriesForOrder[0];

              return (
                <React.Fragment key={order.orderId}>
                  <FloorTableRow
                    order={order}
                    storageEntry={mainStorageEntry}
                    storageEntries={storageEntriesForOrder}
                    purposeLabelByCode={purposeLabelByCode}
                    findFlavor={findFlavor}
                  />

                  {storageEntriesForOrder.map((entry, index) => (
                    <FloorChildRow
                      key={`${order.orderId}-${entry.lotId}-${index}`}
                      parentOrder={order}
                      storageEntry={entry}
                      childIndex={index + 1}
                      storageByFactory={storageByFactory}
                      findFlavor={findFlavor}
                      purposeLabelByCode={purposeLabelByCode}
                    />
                  ))}
                </React.Fragment>
              );
            })}
            {activeOrders.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-slate-400">
                  表示できるデータがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400">行数: {activeOrders.length}</div>
    </div>
  );
}

function FloorTableRow({
  order,
  storageEntry,
  storageEntries,
  purposeLabelByCode,
  findFlavor,
}: {
  order: OrderCard;
  storageEntry?: StorageAggEntry;
  storageEntries?: StorageAggEntry[];
  purposeLabelByCode: Record<string, string>;
  findFlavor: (flavorId: string) => FlavorWithRecipe | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const line = order.lines[0];
  const flavor = findFlavor(line.flavorId) ?? { ...defaultFlavor, id: line.flavorId };
  const flavorName = flavor.flavorName || line.flavorId;
  const packToGram = flavor.packToGram ?? 0;
  const shouldPacks = line.useType === "oem" ? undefined : line.packs;
  const madePacks = Number.isFinite(line.madePacks as number) ? line.madePacks ?? 0 : 0;
  const totalLeftoverGrams = (storageEntries ?? []).reduce((sum, e) => sum + (e.grams ?? 0), 0);
  const totalPacksEquiv = (storageEntries ?? []).reduce((sum, e) => sum + (e.packsEquiv ?? 0), 0);
  const leftoverPacks =
    totalPacksEquiv > 0
      ? totalPacksEquiv
      : packToGram > 0 && totalLeftoverGrams > 0
        ? totalLeftoverGrams / packToGram
        : undefined;
  const status: StatusType = (() => {
    if (totalLeftoverGrams > 0) return "保管中";
    if (shouldPacks !== undefined && madePacks >= (shouldPacks ?? 0) && order.archived) return "全量使用";
    if (shouldPacks !== undefined && madePacks >= (shouldPacks ?? 0)) return "製造完了";
    if (madePacks > 0 && (shouldPacks === undefined || madePacks < (shouldPacks ?? 0))) return "製造中";
    return "指示";
  })();

  const useLabel = line.useCode
    ? purposeLabelByCode[line.useCode] ?? line.useCode
    : line.useType === "oem"
      ? "OEM"
      : "製品";

  const madeGrams = packToGram > 0 && madePacks > 0 ? madePacks * packToGram : undefined;
  const packsLabel = shouldPacks !== undefined ? `${formatPacks(shouldPacks)}パック分` : "OEM";
  const madePacksLabel = shouldPacks !== undefined ? `${formatPacks(madePacks)}パック分` : "-";
  const leftoverPacksLabel = leftoverPacks !== undefined ? `${formatPacks(leftoverPacks)}パック分` : undefined;

  const locationsSet = new Set<string>();
  (storageEntries ?? []).forEach(e => {
    (e.locations ?? []).forEach(loc => locationsSet.add(loc));
  });
  const locationsText = Array.from(locationsSet).join(" / ") || "-";
  const hasLeftover = totalLeftoverGrams > 0;
  const canSplit = line ? line.useType === "fissule" && (line.packs ?? 0) > 0 : false;
  const returnTo = useMemo(() => {
    const search = searchParams.toString();
    return `${pathname}${search ? `?${search}` : ""}`;
  }, [pathname, searchParams]);
  const navigateToAction = (path: string, extras?: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set("factory", order.factoryCode);
    params.set("order_id", order.orderId);
    params.set("lot_id", order.lotId);
    params.set("flavor_id", line.flavorId);
    params.set("return_to", returnTo || "/floor");
    if (extras) {
      Object.entries(extras).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        }
      });
    }
    router.push(`/actions/${path}?${params.toString()}`);
  };

  return (
    <tr className={`align-top ${status === "全量使用" ? "opacity-70" : ""}`}>
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{order.orderedAt}</td>
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{order.deadlineAt ?? "-"}</td>
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{storageEntry?.manufacturedAt || "-"}</td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <div className="font-semibold">{flavorName}</div>
        <div className="text-xs text-muted-foreground">{order.lotId}</div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{useLabel}</td>
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
        <div className="flex flex-wrap gap-1">
          <StatusPill status={status} />
          {hasLeftover && status !== "保管中" && status !== "全量使用" && (
            <StatusPill status="保管中" />
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateToAction("keep")}
          >
            保管
          </Button>
          <Button
            size="sm"
            onClick={() =>
              navigateToAction("made", canSplit ? undefined : { mode: "bulk" })
            }
          >
            作った
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigateToAction("skip")}
          >
            作らない
          </Button>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 text-right">
        <QtyCell grams={line.requiredGrams} packsLabel={packsLabel} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 text-right">
        <QtyCell grams={madeGrams} packsLabel={madePacksLabel} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 text-right">
        <QtyCell grams={totalLeftoverGrams} packsLabel={leftoverPacksLabel} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-700" title={locationsText}>
        {locationsText}
      </td>
    </tr>
  );
}

function FloorChildRow({
  parentOrder,
  storageEntry,
  childIndex,
  storageByFactory,
  findFlavor,
  purposeLabelByCode,
}: {
  parentOrder: OrderCard;
  storageEntry: StorageAggEntry;
  childIndex: number;
  storageByFactory: Record<string, string[]>;
  findFlavor: (id: string) => FlavorWithRecipe | undefined;
  purposeLabelByCode: Record<string, string>;
}) {
  const [useOpen, setUseOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [useQty, setUseQty] = useState(0);
  const [useQtyInput, setUseQtyInput] = useState("");
  const [useOutcome, setUseOutcome] = useState<"extra" | "none" | "shortage" | "">("");
  const [leftQty, setLeftQty] = useState(0);
  const [leftQtyInput, setLeftQtyInput] = useState("");
  const [loc, setLoc] = useState<string>(storageEntry.locations[0] || "");
  const [wasteReason, setWasteReason] = useState<"expiry" | "mistake" | "other" | "">("");
  const [wasteQty, setWasteQty] = useState(0);
  const [wasteQtyInput, setWasteQtyInput] = useState("");
  const [wasteText, setWasteText] = useState("");
  const useRequestIdRef = useRef<string | null>(null);
  const wasteRequestIdRef = useRef<string | null>(null);
  const [useBusy, setUseBusy] = useState(false);
  const [wasteBusy, setWasteBusy] = useState(false);

  useEffect(() => {
    if (useOpen) {
      setUseQty(0);
      setUseQtyInput("");
      setUseOutcome("");
      setLeftQty(0);
      setLeftQtyInput("");
      setLoc(storageEntry.locations[0] || "");
    }
  }, [useOpen, storageEntry.locations]);

  useEffect(() => {
    if (wasteOpen) {
      setWasteReason("");
      setWasteQty(0);
      setWasteQtyInput("");
      setWasteText("");
      setLoc(storageEntry.locations[0] || "");
    }
  }, [wasteOpen, storageEntry.locations]);

  const flavor = findFlavor(storageEntry.flavorId) ?? { ...defaultFlavor, id: storageEntry.flavorId };
  const line = parentOrder.lines[0];
  const useLabel = line.useCode
    ? purposeLabelByCode[line.useCode] ?? line.useCode
    : line.useType === "oem"
      ? "OEM"
      : "製品";

  const effectiveLocation = (current: string) => current || storageEntry.locations[0] || "";

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
      await apiPost("action", {
        type: "USE",
        factory_code: parentOrder.factoryCode,
        lot_id: storageEntry.lotId,
        flavor_id: storageEntry.flavorId,
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
        mutate(["storage-agg", parentOrder.factoryCode]),
        mutate(["orders", parentOrder.factoryCode, false]),
      ]);
      useRequestIdRef.current = null;
      setUseOpen(false);
    } catch (error) {
      console.error(error);
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
      const payload =
        wasteReason === "other"
          ? { reason: "other", note: wasteText, grams: wasteQty, qty: wasteQty, location }
          : { reason: wasteReason, grams: wasteQty, qty: wasteQty, location };

      await apiPost("action", {
        type: "WASTE",
        factory_code: parentOrder.factoryCode,
        lot_id: storageEntry.lotId,
        flavor_id: storageEntry.flavorId,
        payload,
      }, { requestId });

      await Promise.all([
        mutate(["storage-agg", parentOrder.factoryCode]),
        mutate(["orders", parentOrder.factoryCode, false]),
      ]);
      wasteRequestIdRef.current = null;
      setWasteOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setWasteBusy(false);
    }
  };

  const locations = storageByFactory[parentOrder.factoryCode] || [];

  return (
    <tr className="align-top bg-orange-50/60">
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">-</td>
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{parentOrder.deadlineAt ?? "-"}</td>
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{storageEntry.manufacturedAt}</td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300">└</span>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-slate-600 bg-white">
              子ロット #{childIndex}
            </span>
            <span className="text-sm text-slate-700">{flavor.flavorName}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {storageEntry.lotId} / {storageEntry.manufacturedAt}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{useLabel}</td>
      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
        <StatusPill status="保管中" />
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setUseOpen(true)}>使う</Button>
          <Button size="sm" variant="destructive" onClick={() => setWasteOpen(true)}>廃棄</Button>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 text-right">-</td>
      <td className="px-4 py-3 text-sm text-slate-700 text-right">
        <QtyCell grams={storageEntry.grams} packsLabel={storageEntry.packsEquiv ? `${formatPacks(storageEntry.packsEquiv)}パック分` : undefined} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 text-right">
        <QtyCell grams={storageEntry.grams} packsLabel={storageEntry.packsEquiv ? `${formatPacks(storageEntry.packsEquiv)}パック分` : undefined} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">{storageEntry.locations.join(" / ")}</td>

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
                  value={useQtyInput}
                  onChange={e => {
                    const raw = e.target.value;
                    setUseQtyInput(raw);
                    setUseQty(Number.parseInt(raw || "0", 10));
                  }}
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
                    value={leftQtyInput}
                    onChange={e => {
                      const raw = e.target.value;
                      setLeftQtyInput(raw);
                      setLeftQty(Number.parseInt(raw || "0", 10));
                    }}
                  />
                </div>
                <div>
                  <Label>保管場所</Label>
                  <Select value={loc} onValueChange={setLoc}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map(l => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {useOutcome !== "extra" && (
              <div>
                <Label>保管場所</Label>
                <Select value={loc} onValueChange={setLoc}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(l => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUseOpen(false)}>キャンセル</Button>
            <Button
              disabled={
                useBusy ||
                useQty <= 0 ||
                (useOutcome === "extra" && (leftQty <= 0 || !effectiveLocation(loc))) ||
                !effectiveLocation(loc)
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>廃棄理由</Label>
                <Select value={wasteReason} onValueChange={(value: "expiry" | "mistake" | "other") => setWasteReason(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expiry">期限切れ</SelectItem>
                    <SelectItem value="mistake">誤製造</SelectItem>
                    <SelectItem value="other">その他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>廃棄量（g）</Label>
                <Input
                  type="number"
                  value={wasteQtyInput}
                  onChange={e => {
                    const raw = e.target.value;
                    setWasteQtyInput(raw);
                    setWasteQty(Number.parseInt(raw || "0", 10));
                  }}
                />
              </div>
            </div>
            <div>
              <Label>保管場所</Label>
              <Select value={loc} onValueChange={setLoc}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {wasteReason === "other" && (
              <div>
                <Label>詳細</Label>
                <Input value={wasteText} onChange={e => setWasteText(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setWasteOpen(false)}>キャンセル</Button>
            <Button
              disabled={
                wasteBusy ||
                wasteQty <= 0 ||
                wasteReason === "" ||
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
    </tr>
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
  const [useQtyInput, setUseQtyInput] = useState("");
  const [useOutcome, setUseOutcome] = useState<"extra" | "none" | "shortage" | "">("");
  const [leftQty, setLeftQty] = useState(0);
  const [leftQtyInput, setLeftQtyInput] = useState("");
  const [loc, setLoc] = useState<string>(agg.locations[0] || "");
  const [wasteReason, setWasteReason] = useState<"expiry" | "mistake" | "other" | "">("");
  const [wasteQty, setWasteQty] = useState(0);
  const [wasteQtyInput, setWasteQtyInput] = useState("");
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
      setUseQtyInput("");
      setUseOutcome("");
      setLeftQty(0);
      setLeftQtyInput("");
      setLoc(agg.locations[0] || "");
    }
  }, [useOpen, agg.locations]);

  useEffect(() => {
    if (wasteOpen) {
      setWasteReason("");
      setWasteQty(0);
      setWasteQtyInput("");
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
                  value={useQtyInput}
                  onChange={e => {
                    const raw = e.target.value;
                    setUseQtyInput(raw);
                    setUseQty(Number.parseInt(raw || "0", 10));
                  }}
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
                    value={leftQtyInput}
                    onChange={e => {
                      const raw = e.target.value;
                      setLeftQtyInput(raw);
                      setLeftQty(Number.parseInt(raw || "0", 10));
                    }}
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
                  value={wasteQtyInput}
                  onChange={e => {
                    const raw = e.target.value;
                    setWasteQtyInput(raw);
                    setWasteQty(Number.parseInt(raw || "0", 10));
                  }}
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
