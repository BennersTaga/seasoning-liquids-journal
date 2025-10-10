import useSWR from "swr";

import { apiGet } from "@/lib/gas";
import type { MadeSummaryResponse } from "@/lib/sheets/types";

type MadeSummaryKey = readonly ["made-summary", string, string, string];

export function useMadeSummary(
  start?: string | null,
  end?: string | null,
  factory?: string | null,
) {
  const hasRange = Boolean(start && end);
  const key: MadeSummaryKey | null = hasRange
    ? (["made-summary", start!, end!, factory ?? ""] as const)
    : null;

  return useSWR<MadeSummaryResponse>(
    key,
    ([, s, e, f]) =>
      apiGet<MadeSummaryResponse>("made-summary", {
        start: s,
        end: e,
        ...(f ? { factory: f } : {}),
      }),
    { revalidateOnFocus: false },
  );
}
