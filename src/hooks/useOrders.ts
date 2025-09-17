import useSWR from "swr";

import { apiGet } from "@/lib/gas";
import type { OrderRow } from "@/lib/sheets/types";

export const ordersKey = (factory: string) => `gas:orders:${factory}`;

export function useOrders(factory: string | undefined, enabled = true) {
  const key = enabled && factory ? ordersKey(factory) : null;
  return useSWR<OrderRow[]>(
    key,
    () => apiGet<OrderRow[]>("orders", { factory, archived: false }),
    { revalidateOnFocus: false },
  );
}
