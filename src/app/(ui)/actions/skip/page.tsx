'use client';

import React, { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMasters } from "@/hooks/useMasters";
import { useOrders } from "@/hooks/useOrders";
import { deriveDataFromMasters, normalizeOrders } from "@/app/(ui)/prototype/shared";

export default function SkipActionPage() {
  return (
    <Suspense fallback={null}>
      <SkipActionPageInner />
    </Suspense>
  );
}

function SkipActionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to") || "/office";
  const factoryParam = searchParams.get("factory") ?? "";
  const orderIdParam = searchParams.get("order_id") ?? "";
  const mastersQuery = useMasters();
  const { factories } = useMemo(() => deriveDataFromMasters(mastersQuery.data), [mastersQuery.data]);
  const factoryCode = factoryParam || factories[0]?.code || "";
  const ordersQuery = useOrders(factoryCode || undefined, false);
  const orders = useMemo(() => normalizeOrders(ordersQuery.data), [ordersQuery.data]);
  const targetOrder = useMemo(
    () => orders.find(order => order.orderId === orderIdParam),
    [orders, orderIdParam],
  );

  return (
    <div className="min-h-screen bg-orange-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" onClick={() => router.push(returnTo)}>
          ← 戻る
        </Button>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>作らない</CardTitle>
            <CardDescription>従来のポップアップと同じく、入力は不要です。</CardDescription>
            {targetOrder ? (
              <div className="text-sm text-muted-foreground mt-2">
                ロット: {targetOrder.lotId} / 工場: {targetOrder.factoryCode}
              </div>
            ) : (
              <div className="text-sm text-red-600 mt-2">対象の指示が見つかりませんでした。</div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              この操作はダイアログで理由入力を表示していましたが、送信処理はありませんでした。
              必要に応じて戻るボタンから元の画面へお戻りください。
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push(returnTo)}>
                戻る
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
