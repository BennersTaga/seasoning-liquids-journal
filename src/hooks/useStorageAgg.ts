import useSWR from "swr";
import { apiGet } from "@/lib/gas";
import type { StorageAggRow } from "@/lib/sheets/types";

export function useStorageAgg(factory?: string) {
  return useSWR(
    factory ? ["storage-agg", factory] : null,
    factory ? () => apiGet<StorageAggRow[]>("storage-agg", { factory }) : null,
    { revalidateOnFocus: false },
  );
}
