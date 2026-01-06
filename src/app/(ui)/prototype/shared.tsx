'use client';

import React from "react";
import { format } from "date-fns";
import type { Masters, OrderRow, ReporterRow, StorageAggRow, UseType } from "@/lib/sheets/types";

export type FlavorRecipeItem = { ingredient: string; qty: number; unit: string };

export type MaterialLine = {
  ingredient_id?: string;
  ingredient_name: string;
  reported_qty: number;
  unit?: string;
  store_location?: string;
  source?: "entered";
};

export interface FlavorWithRecipe {
  id: string;
  flavorName: string;
  liquidName: string;
  packToGram: number;
  expiryDays: number;
  recipe: FlavorRecipeItem[];
}

export interface OrderLine {
  flavorId: string;
  packs: number;
  packsRemaining?: number;
  madePacks?: number;
  requiredGrams: number;
  useType: "fissule" | "oem";
  useCode?: string;
  oemPartner?: string;
  oemGrams?: number;
}

export interface OrderCard {
  orderId: string;
  lotId: string;
  factoryCode: string;
  orderedAt: string;
  deadlineAt?: string;
  lines: OrderLine[];
  archived: boolean;
}

export interface StorageAggEntry {
  lotId: string;
  factoryCode: string;
  flavorId: string;
  grams: number;
  packsEquiv?: number;
  locations: string[];
  manufacturedAt: string;
}

export interface Reporter {
  id: string;
  name: string;
  factoryCode?: string;
  sortOrder: number;
}

export type MadeReport = {
  packs: number;
  grams: number;
  manufacturedAt: string;
  result: "extra" | "used";
  leftover?: { location: string; grams: number } | null;
  materials?: MaterialLine[];
  by?: string;
};

export type KeepFormValues = { location: string; grams: number; manufacturedAt: string; by?: string };

export const defaultFlavor: FlavorWithRecipe = {
  id: "",
  flavorName: "未設定",
  liquidName: "未設定",
  packToGram: 0,
  expiryDays: 0,
  recipe: [],
};

export const selectFallback = (loading: boolean, emptyLabel = "データなし") => (
  <div className="px-2 py-1 text-sm text-muted-foreground">
    {loading ? "読み込み中..." : emptyLabel}
  </div>
);

export const formatNumber = (n: number) => n.toLocaleString();
export const formatGram = (n: number) => `${formatNumber(n)} g`;
export const formatPacks = (n: number) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString();
export const genId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
export const genLotId = (factoryCode: string, seq: number, d = new Date()) =>
  `${factoryCode}-${format(d, "yyyyMMdd")}-${String(seq).padStart(3, "0")}`;
export const lotIdPattern = /^([A-Z0-9]+-\d{8}-\d{3})(?:-(\d+))?$/;
export const isChildLot = (lotId: string) => Boolean(lotId.match(lotIdPattern)?.[2]);

export interface DerivedMastersData {
  factories: { code: string; name: string }[];
  storageByFactory: Record<string, string[]>;
  flavors: FlavorWithRecipe[];
  oemList: string[];
  uses: { code: string; name: string; type: UseType }[];
  allowedByUse: Record<string, Set<string>>;
  reporters: Reporter[];
}

function normalizeReporterSortOrder(raw: ReporterRow["sort_order"]) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw === null || raw === undefined) return Number.MAX_SAFE_INTEGER;
  const trimmed = String(raw).trim();
  if (!trimmed) return Number.MAX_SAFE_INTEGER;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function toReporterId(row: ReporterRow) {
  const id = (row.reporter_id || row.reporter_name || "").trim();
  return id;
}

function toReporterName(row: ReporterRow) {
  const name = (row.reporter_name || row.reporter_id || "").trim();
  return name;
}

function isActiveReporterRow(row: ReporterRow) {
  return String(row.active ?? "").toLowerCase() !== "no";
}

function hasReporterIdentityRow(row: ReporterRow) {
  return toReporterId(row).length > 0 && toReporterName(row).length > 0;
}

export function deriveDataFromMasters(masters?: Masters): DerivedMastersData {
  const factories =
    masters?.factories?.map(factory => ({
      code: factory.factory_code,
      name: factory.factory_name,
    })) ?? [];

  const storageByFactory: Record<string, string[]> = {};
  factories.forEach(factory => {
    storageByFactory[factory.code] = [];
  });
  masters?.locations?.forEach(location => {
    if (!storageByFactory[location.factory_code]) {
      storageByFactory[location.factory_code] = [];
    }
    storageByFactory[location.factory_code].push(location.location_name);
  });

  const recipeMap =
    masters?.recipes?.reduce<Map<string, FlavorRecipeItem[]>>((map, row) => {
      const arr = map.get(row.flavor_id) ?? [];
      arr.push({ ingredient: row.ingredient_name, qty: row.qty, unit: row.unit });
      map.set(row.flavor_id, arr);
      return map;
    }, new Map()) ?? new Map();

  const flavors: FlavorWithRecipe[] =
    masters?.flavors?.map(fl => ({
      id: fl.flavor_id,
      flavorName: fl.flavor_name,
      liquidName: fl.liquid_name,
      packToGram: fl.pack_to_gram,
      expiryDays: fl.expiry_days,
      recipe: recipeMap.get(fl.flavor_id) ?? [],
    })) ?? [];

  const oemList = masters?.oem_partners?.map(partner => partner.partner_name) ?? [];

  const uses =
    masters?.uses?.map(u => {
      const name = (u.use_name ?? "").trim();
      let type: UseType = u.use_type;
      if (name === "OEM(送付分)") {
        type = "fissule";
      } else if (name === "玄海丼(送付分)" || name === "玄海丼(製造分)") {
        type = "oem";
      }
      return {
        code: u.use_code,
        name: u.use_name,
        type,
      };
    }) ?? [];

  const allowedByUse: Record<string, Set<string>> = {};
  masters?.use_flavors?.forEach(row => {
    if (!allowedByUse[row.use_code]) {
      allowedByUse[row.use_code] = new Set();
    }
    allowedByUse[row.use_code].add(row.flavor_id);
  });

  const reporters: Reporter[] =
    masters?.reporters
      ?.filter(isActiveReporterRow)
      ?.filter(hasReporterIdentityRow)
      ?.map(rep => ({
        id: toReporterId(rep),
        name: toReporterName(rep),
        factoryCode: rep.factory_code?.trim() || undefined,
        sortOrder: normalizeReporterSortOrder(rep.sort_order),
      }))
      ?.sort((a, b) => {
        if (a.sortOrder === b.sortOrder) {
          return a.name.localeCompare(b.name, "ja");
        }
        return a.sortOrder - b.sortOrder;
      }) ?? [];

  return { factories, storageByFactory, flavors, oemList, uses, allowedByUse, reporters };
}

export function normalizeOrders(rows?: OrderRow[]): OrderCard[] {
  if (!rows?.length) return [];
  const map = new Map<string, OrderCard>();

  rows.forEach(row => {
    const useTypeRaw = String(row.use_type ?? "").trim().toLowerCase();
    const isOem = useTypeRaw === "oem";

    const packsNum = Number(row.packs);
    const packsRemainingNum = Number(row.packs_remaining);
    const requiredGramsNum = Number(row.required_grams);
    const madePacksNum = Number(row.made_packs);

    const line: OrderLine = isOem
      ? {
          flavorId: row.flavor_id,
          packs: 0,
          madePacks: Number.isFinite(madePacksNum) ? madePacksNum : 0,
          requiredGrams: Number.isFinite(requiredGramsNum) ? requiredGramsNum : 0,
          useType: "oem",
          useCode: row.use_code ?? undefined,
          oemPartner: row.oem_partner ?? undefined,
          oemGrams: Number.isFinite(requiredGramsNum) ? requiredGramsNum : 0,
        }
      : {
          flavorId: row.flavor_id,
          packs: Number.isFinite(packsNum) ? packsNum : 0,
          packsRemaining: Number.isFinite(packsRemainingNum)
            ? packsRemainingNum
            : Number.isFinite(packsNum)
              ? packsNum
              : 0,
          madePacks: Number.isFinite(madePacksNum) ? madePacksNum : 0,
          requiredGrams: Number.isFinite(requiredGramsNum) ? requiredGramsNum : 0,
          useType: "fissule",
          useCode: row.use_code ?? undefined,
        };

    const existing = map.get(row.order_id);
    if (existing) {
      existing.lines.push(line);
      existing.archived = row.archived;
      existing.deadlineAt = row.deadline_at ?? existing.deadlineAt;
    } else {
      map.set(row.order_id, {
        orderId: row.order_id,
        lotId: row.lot_id,
        factoryCode: row.factory_code,
        orderedAt: row.ordered_at,
        deadlineAt: row.deadline_at ?? undefined,
        lines: [line],
        archived: row.archived,
      });
    }
  });

  return Array.from(map.values());
}

export function normalizeStorage(rows?: StorageAggRow[]): StorageAggEntry[] {
  if (!rows?.length) return [];
  return rows
    .map(row => ({
      lotId: row.lot_id,
      factoryCode: row.factory_code,
      flavorId: row.flavor_id,
      grams: row.grams,
      packsEquiv: row.packs_equiv ?? undefined,
      locations: row.locations ?? [],
      manufacturedAt: row.manufactured_at,
    }))
    .filter(entry => Math.abs(entry.grams) > 0);
}
