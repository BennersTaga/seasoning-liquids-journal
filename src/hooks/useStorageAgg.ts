import useSWR from "swr";

import { apiGet } from "@/lib/gas";
import type { StorageAggRow } from "@/lib/sheets/types";

export const storageAggKey = (factory: string) => `gas:storage-agg:${factory}`;

export function useStorageAgg(factory: string | undefined, enabled = true) {
  const key = enabled && factory ? storageAggKey(factory) : null;
  return useSWR<StorageAggRow[]>(
    key,
    () => apiGet<StorageAggRow[]>("storage-agg", { factory }),
    { revalidateOnFocus: false },
  );
}
