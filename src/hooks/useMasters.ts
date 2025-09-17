import useSWR from "swr";

import { apiGet } from "@/lib/gas";
import type { Masters } from "@/lib/sheets/types";

export const mastersKey = "gas:masters" as const;

export function useMasters(enabled = true) {
  const key = enabled ? mastersKey : null;
  return useSWR<Masters>(
    key,
    () => apiGet<Masters>("masters"),
    { revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 },
  );
}
