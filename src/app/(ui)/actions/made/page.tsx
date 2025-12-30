'use client';

import React, { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiPost } from "@/lib/gas";
import { useMasters } from "@/hooks/useMasters";
import { useOrders } from "@/hooks/useOrders";
import {
  defaultFlavor,
  deriveDataFromMasters,
  formatGram,
  genId,
  normalizeOrders,
  type MadeReport,
} from "@/app/(ui)/prototype/shared";
import { MadeActionForm } from "@/components/actions/action-forms";
import { mutate } from "swr";

export default function MadeActionPage() {
  return (
    <Suspense fallback={null}>
      <MadeActionPageInner />
    </Suspense>
  );
}

function MadeActionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to") || "/office";
  const factoryParam = searchParams.get("factory") ?? "";
  const orderIdParam = searchParams.get("order_id") ?? "";
  const initialMode = (searchParams.get("mode") as "bulk" | "split" | null) ?? "bulk";

  const mastersQuery = useMasters();
  const { flavors, storageByFactory } = useMemo(
    () => deriveDataFromMasters(mastersQuery.data),
    [mastersQuery.data],
  );
  const findFlavor = useMemo(
    () => (id: string) => flavors.find(fl => fl.id === id) ?? defaultFlavor,
    [flavors],
  );
  const factoryCode = factoryParam || mastersQuery.data?.factories?.[0]?.factory_code || "";
  const ordersQuery = useOrders(factoryCode || undefined, false);
  const orders = useMemo(() => normalizeOrders(ordersQuery.data), [ordersQuery.data]);
  const targetOrder = useMemo(
    () => orders.find(order => order.orderId === orderIdParam),
    [orders, orderIdParam],
  );
  const [mode, setMode] = useState<"bulk" | "split">(initialMode === "split" ? "split" : "bulk");
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remainingPacks = useMemo(() => {
    if (!targetOrder) return 0;
    const line = targetOrder.lines[0];
    return Math.max(0, line.packsRemaining ?? line.packs ?? 0);
  }, [targetOrder]);

  const canSplit = useMemo(() => {
    if (!targetOrder) return false;
    const line = targetOrder.lines[0];
    return line.useType === "fissule" && (line.packs ?? 0) > 0;
  }, [targetOrder]);

  const handleReportMade = async (report: MadeReport) => {
    if (!targetOrder) return;
    const line = targetOrder.lines[0];
    const leftoverPayload =
      report.leftover && report.leftover.grams > 0
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
    const finalPayload = materialsPayload.length ? { ...basePayload, materials: materialsPayload } : basePayload;
    if (!requestIdRef.current) {
      requestIdRef.current = genId();
    }
    const requestId = requestIdRef.current as string;
    try {
      setBusy(true);
      setError(null);
      await apiPost(
        "action",
        {
          type: "MADE_SPLIT",
          factory_code: targetOrder.factoryCode,
          lot_id: targetOrder.lotId,
          flavor_id: line.flavorId,
          payload: finalPayload,
        },
        { requestId },
      );
      await Promise.all([
        mutate(["orders", targetOrder.factoryCode, false]),
        mutate(["storage-agg", targetOrder.factoryCode]),
      ]);
      requestIdRef.current = null;
      router.push(returnTo);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error && err.message ? err.message : "通信に失敗しました";
      setError(`${message} (request_id: ${requestId})`);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const modeTabs = (
    <Tabs value={mode} onValueChange={value => setMode(value as "bulk" | "split")} className="w-full">
      <TabsList>
        <TabsTrigger value="bulk">一括で作った</TabsTrigger>
        <TabsTrigger value="split" disabled={!canSplit}>
          分割して作った
        </TabsTrigger>
      </TabsList>
      {!canSplit && (
        <div className="text-xs text-muted-foreground mt-2">
          ※ OEM やパック数未設定の指示では分割できません
        </div>
      )}
      <TabsContent value="bulk" />
      <TabsContent value="split" />
    </Tabs>
  );

  return (
    <div className="min-h-screen bg-orange-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Button variant="ghost" onClick={() => router.push(returnTo)}>
          ← 戻る
        </Button>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>作った（報告）</CardTitle>
            <CardDescription>ダイアログで行っていた報告操作をページに移動しました。</CardDescription>
            {targetOrder && (
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                <div>ロット: {targetOrder.lotId}</div>
                <div>
                  必要量:{" "}
                  {formatGram(
                    targetOrder.lines[0].useType === "oem"
                      ? targetOrder.lines[0].oemGrams || targetOrder.lines[0].requiredGrams
                      : targetOrder.lines[0].requiredGrams,
                  )}
                </div>
              </div>
            )}
            {!targetOrder && (
              <div className="text-sm text-red-600 mt-2">対象の指示が見つかりませんでした。</div>
            )}
            {error && (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {modeTabs}
            {targetOrder ? (
              <MadeActionForm
                open
                order={targetOrder}
                mode={mode === "split" && canSplit ? "split" : "bulk"}
                remaining={remainingPacks}
                onReport={handleReportMade}
                findFlavor={findFlavor}
                storageByFactory={storageByFactory}
                mastersLoading={mastersQuery.isLoading || (!mastersQuery.data && !mastersQuery.error)}
                busy={busy}
                onCancel={() => router.push(returnTo)}
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                工場や指示の検索条件を確認してください。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
