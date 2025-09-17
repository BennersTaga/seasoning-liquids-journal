import useSWR from "swr";
import { apiGet } from "@/lib/gas";
import type { OrderRow } from "@/lib/sheets/types";

export function useOrders(factory?: string, archived = false) {
  return useSWR(
    factory ? ["orders", factory, archived] : null,
    factory ? () => apiGet<OrderRow[]>("orders", { factory, archived }) : null,
    { revalidateOnFocus: false },
  );
}
