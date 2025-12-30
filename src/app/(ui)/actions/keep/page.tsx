'use client';

import React, { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/gas";
import { useMasters } from "@/hooks/useMasters";
import { useOrders } from "@/hooks/useOrders";
import { deriveDataFromMasters, genId, normalizeOrders, type KeepFormValues } from "@/app/(ui)/prototype/page";
import { KeepActionForm } from "@/components/actions/action-forms";
import { mutate } from "swr";

export default function KeepActionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to") || "/office";
  const factoryParam = searchParams.get("factory") ?? "";
  const orderIdParam = searchParams.get("order_id") ?? "";
  const mastersQuery = useMasters();
  const { storageByFactory, factories } = useMemo(
    () => deriveDataFromMasters(mastersQuery.data),
    [mastersQuery.data],
  );
  const factoryCode = factoryParam || factories[0]?.code || "";
  const ordersQuery = useOrders(factoryCode || undefined, false);
  const orders = useMemo(() => normalizeOrders(ordersQuery.data), [ordersQuery.data]);
  const targetOrder = useMemo(
    () => orders.find(order => order.orderId === orderIdParam),
    [orders, orderIdParam],
  );
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: KeepFormValues) => {
    if (!targetOrder) return;
    const line = targetOrder.lines[0];
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
          type: "KEEP",
          factory_code: targetOrder.factoryCode,
          lot_id: targetOrder.lotId,
          flavor_id: line.flavorId,
          payload: {
            location: values.location,
            grams: values.grams,
            manufactured_at: values.manufacturedAt,
          },
        },
        { requestId },
      );
      await Promise.all([
        mutate(["storage-agg", targetOrder.factoryCode]),
        mutate(["orders", targetOrder.factoryCode, false]),
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

  return (
    <div className="min-h-screen bg-orange-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" onClick={() => router.push(returnTo)}>
          ← 戻る
        </Button>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>保管登録</CardTitle>
            <CardDescription>ダイアログで行っていた保管登録をページで行います。</CardDescription>
            {targetOrder && (
              <div className="text-sm text-muted-foreground mt-2">
                ロット: {targetOrder.lotId} / 工場: {targetOrder.factoryCode}
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
          <CardContent>
            {targetOrder ? (
              <KeepActionForm
                open
                factoryCode={targetOrder.factoryCode}
                storageByFactory={storageByFactory}
                mastersLoading={mastersQuery.isLoading || (!mastersQuery.data && !mastersQuery.error)}
                busy={busy}
                onSubmit={handleSubmit}
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
