import useSWR, { mutate } from "swr";

import { apiGet } from "@/lib/gas";
import type { OrderRow } from "@/lib/sheets/types";

export function useOrders(factory: string | undefined, archived = false) {
  const key = factory ? ["orders", factory, archived] : null;
  return useSWR<OrderRow[]>(
    key,
    () => apiGet<OrderRow[]>("orders", { factory, archived }),
    { revalidateOnFocus: false },
  );
}

export const refreshOrders = (factory: string, archived = false) =>
  mutate(["orders", factory, archived]);
