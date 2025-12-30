'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { mutate } from "swr";

import { OnsiteMakeForm } from "@/components/actions/action-forms";
import {
  deriveDataFromMasters,
  genId,
  genLotId,
  defaultFlavor,
  normalizeOrders,
  type MaterialLine,
} from "@/app/(ui)/prototype/page";
import { useMasters } from "@/hooks/useMasters";
import { useOrders } from "@/hooks/useOrders";
import { apiPost } from "@/lib/gas";

export default function ExtraActionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to") || "/office";
  const factoryParam = searchParams.get("factory") ?? "";
  const defaultFlavorParam = searchParams.get("flavor_id") ?? "";

  const mastersQuery = useMasters();
  const { flavors, storageByFactory, oemList, uses, factories } = useMemo(
    () => deriveDataFromMasters(mastersQuery.data),
    [mastersQuery.data],
  );
  const findFlavor = useMemo(
    () => (id: string) => flavors.find(fl => fl.id === id) ?? flavors[0] ?? { ...defaultFlavor, id },
    [flavors],
  );
  const factoryCode = factoryParam || factories[0]?.code || "";
  const ordersQuery = useOrders(factoryCode || undefined, false);
  const orders = useMemo(() => normalizeOrders(ordersQuery.data), [ordersQuery.data]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const seqRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const next = { ...seqRef.current };
    orders.forEach(order => {
      const lotId = order.lotId;
      if (!lotId) return;
      const match = /^([A-Z0-9]+)-(\d{8})-(\d+)$/.exec(lotId);
      if (!match) return;
      const [, fCode, datePart, suffix] = match;
      const numeric = Number.parseInt(suffix, 10);
      if (Number.isNaN(numeric)) return;
      const key = `${fCode}-${datePart}`;
      const candidate = numeric + 1;
      if (!next[key] || next[key] < candidate) {
        next[key] = candidate;
      }
    });
    seqRef.current = next;
  }, [orders]);

  const handleRegister = async (
    factory: string,
    flavorId: string,
    useType: "fissule" | "oem",
    useCode: string,
    producedG: number,
    manufacturedAt: string,
    oemPartner?: string,
    leftover?: { loc: string; grams: number },
    _lotId?: string,
    materials?: MaterialLine[] | null,
    packs?: number,
  ) => {
    const parsed = manufacturedAt ? new Date(manufacturedAt) : new Date();
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const dateSegment = format(date, "yyyyMMdd");
    const key = `${factory}-${dateSegment}`;
    const seq = seqRef.current[key] ?? 1;
    const lotId = genLotId(factory, seq, date);
    if (!requestIdRef.current) {
      requestIdRef.current = genId();
    }
    const requestId = requestIdRef.current as string;
    const payload = {
      factory_code: factory,
      flavor_id: flavorId,
      use_type: useType,
      use_code: useCode.trim(),
      produced_grams: producedG,
      manufactured_at: manufacturedAt,
      oem_partner: useType === "oem" ? oemPartner ?? null : null,
      leftover: leftover && leftover.grams > 0 ? { location: leftover.loc, grams: leftover.grams } : null,
      generated_lot_id: lotId,
      materials:
        materials && materials.length
          ? materials.map(m => ({
              ingredient_id: m.ingredient_id ?? undefined,
              ingredient_name: m.ingredient_name,
              reported_qty: Number(m.reported_qty ?? 0),
              unit: m.unit ?? "g",
              store_location: m.store_location ?? undefined,
            }))
          : undefined,
      packs: Number.isFinite(packs) ? Number(packs) : 0,
    };
    try {
      setBusy(true);
      setError(null);
      await apiPost("onsite-make", payload, { requestId });
      await Promise.all([
        mutate(["orders", factory, false]),
        mutate(["storage-agg", factory]),
      ]);
      seqRef.current[key] = seq + 1;
      requestIdRef.current = null;
      router.push(returnTo);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error && err.message ? err.message : "通信に失敗しました";
      setError(`${message} (request_id: ${requestId})`);
      await Promise.all([
        mutate(["orders", factory, false]),
        mutate(["storage-agg", factory]),
      ]);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-orange-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Button variant="ghost" onClick={() => router.push(returnTo)}>
          ← 戻る
        </Button>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>＋ 追加で作成</CardTitle>
            <CardDescription>現場での追加作成報告をページで行います。</CardDescription>
            {error && (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <OnsiteMakeForm
              open
              defaultFlavorId={defaultFlavorParam || flavors[0]?.id || ""}
              factoryCode={factoryCode}
              onRegister={handleRegister}
              busy={busy}
              flavors={flavors}
              oemList={oemList}
              findFlavor={findFlavor}
              storageByFactory={storageByFactory}
              mastersLoading={mastersQuery.isLoading || (!mastersQuery.data && !mastersQuery.error)}
              uses={uses}
              onCancel={() => router.push(returnTo)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
