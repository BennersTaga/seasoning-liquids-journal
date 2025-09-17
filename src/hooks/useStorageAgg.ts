import useSWR, { mutate } from "swr";

import { apiGet } from "@/lib/gas";
import type { StorageAggRow } from "@/lib/sheets/types";

export function useStorageAgg(factory: string | undefined) {
  const key = factory ? ["storage-agg", factory] : null;
  return useSWR<StorageAggRow[]>(
    key,
    () => apiGet<StorageAggRow[]>("storage-agg", { factory }),
    { revalidateOnFocus: false },
  );
}

export const refreshStorage = (factory: string) => mutate(["storage-agg", factory]);
