'use client';

import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type FlavorWithRecipe,
  type KeepFormValues,
  type MadeReport,
  type MaterialLine,
  type OrderCard,
  defaultFlavor,
  formatGram,
  selectFallback,
} from "@/app/(ui)/prototype/shared";

type KeepActionFormProps = {
  open?: boolean;
  factoryCode: string;
  storageByFactory: Record<string, string[]>;
  mastersLoading: boolean;
  busy?: boolean;
  onSubmit: (values: KeepFormValues) => Promise<void>;
  onCancel?: () => void;
  onSubmitted?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
};

export function KeepActionForm({
  open = true,
  factoryCode,
  storageByFactory,
  mastersLoading,
  busy,
  onSubmit,
  onCancel,
  onSubmitted,
  submitLabel = "登録",
  cancelLabel = "キャンセル",
}: KeepActionFormProps) {
  const [loc, setLoc] = useState("");
  const [gramsValue, setGramsValue] = useState(0);
  const [gramsInput, setGramsInput] = useState("");
  const [manufacturedAt, setManufacturedAt] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const locations = storageByFactory[factoryCode] || [];

  useEffect(() => {
    if (open) {
      setLoc("");
      setGramsValue(0);
      setGramsInput("");
      setManufacturedAt(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open, factoryCode]);

  const handleSubmit = async () => {
    if (busy || !loc || gramsValue <= 0 || !manufacturedAt) return;
    try {
      await onSubmit({ location: loc, grams: gramsValue, manufacturedAt });
      onSubmitted?.();
    } catch {
      // keep form open
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>保管場所</Label>
          <Select value={loc} onValueChange={setLoc}>
            <SelectTrigger disabled={mastersLoading || locations.length === 0}>
              <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
            </SelectTrigger>
            <SelectContent>
              {locations.length
                ? locations.map(l => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))
                : selectFallback(mastersLoading)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>数量（g）</Label>
          <Input
            type="number"
            value={gramsInput}
            onChange={e => {
              const raw = e.target.value;
              setGramsInput(raw);
              setGramsValue(Number.parseInt(raw || "0", 10));
            }}
          />
        </div>
        <div>
          <Label>製造日</Label>
          <Input
            type="date"
            value={manufacturedAt}
            onChange={e => setManufacturedAt(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button
          disabled={busy || !loc || gramsValue <= 0 || !manufacturedAt}
          onClick={handleSubmit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

type MadeActionFormProps = {
  open?: boolean;
  order: OrderCard;
  mode: "bulk" | "split";
  remaining: number;
  onReport: (report: MadeReport) => Promise<void>;
  findFlavor: (id: string) => FlavorWithRecipe;
  storageByFactory: Record<string, string[]>;
  mastersLoading: boolean;
  busy?: boolean;
  onCancel?: () => void;
  onSubmitted?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
};

export function MadeActionForm({
  open = true,
  order,
  mode,
  remaining,
  onReport,
  findFlavor,
  storageByFactory,
  mastersLoading,
  busy,
  onCancel,
  onSubmitted,
  submitLabel = "登録",
  cancelLabel = "キャンセル",
}: MadeActionFormProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reported, setReported] = useState<Record<string, string>>({});
  const [expected, setExpected] = useState<Record<string, number>>({});
  const [manufacturedAt, setManufacturedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [outcome, setOutcome] = useState<"extra" | "used" | "">("");
  const [leftLoc, setLeftLoc] = useState("");
  const [leftGrams, setLeftGrams] = useState(0);
  const [leftGramsInput, setLeftGramsInput] = useState("");
  const [packsMade, setPacksMade] = useState(0);
  const [packsMadeInput, setPacksMadeInput] = useState("");
  const line = order.lines[0];
  const flavor = findFlavor(line.flavorId) ?? defaultFlavor;
  const showPackInput = line.useType === "fissule" && (line.packs || 0) > 0;
  const locations = storageByFactory[order.factoryCode] || [];

  useEffect(() => {
    if (open) {
      setChecked({});
      setReported({});
      setExpected({});
      setOutcome("");
      setLeftLoc("");
      setLeftGrams(0);
      setLeftGramsInput("");
      setManufacturedAt(format(new Date(), "yyyy-MM-dd"));
      const def =
        showPackInput && mode === "bulk"
          ? Math.max(0, Math.min(line.packs || 0, remaining || line.packs || 0))
          : 0;
      setPacksMade(def);
      setPacksMadeInput(def > 0 ? String(def) : "");
    }
  }, [open, flavor, line.packs, mode, remaining, showPackInput]);

  const tooMuch = showPackInput && packsMade > Math.max(0, remaining);

  const grams = showPackInput
    ? packsMade * (flavor.packToGram ?? 0)
    : line.oemGrams ?? line.requiredGrams;

  useEffect(() => {
    if (!open) return;
    const sum = flavor.recipe.reduce((total, r) => total + (r.qty || 0), 0);
    const exp: Record<string, number> = {};
    const initChecked: Record<string, boolean> = {};
    const initReported: Record<string, string> = {};
    flavor.recipe.forEach(r => {
      const key = r.ingredient;
      const value = sum > 0 ? Math.round(grams * ((r.qty || 0) / sum)) : 0;
      exp[key] = value;
      initChecked[key] = false;
      initReported[key] = value > 0 ? String(value) : "";
    });
    setExpected(exp);
    setChecked(initChecked);
    setReported(initReported);
  }, [open, flavor.recipe, grams]);

  const submit = async () => {
    if (busy) return;
    if (showPackInput && (packsMade <= 0 || tooMuch)) return;
    if (outcome !== "extra" && outcome !== "used") return;
    const packsValue = showPackInput ? packsMade : 0;
    const gramsValue = grams;
    const leftoverPayload =
      outcome === "extra" && leftGrams > 0 && leftLoc
        ? { location: leftLoc, grams: leftGrams }
        : null;

    const materials: MaterialLine[] = flavor.recipe
      .map((r): MaterialLine | null => {
        const key = r.ingredient;
        if (!checked[key]) return null;
        const raw = reported[key] ?? "";
        const n = Number.parseFloat(String(raw).replace(/,/g, ""));
        if (!Number.isFinite(n) || n <= 0) return null;
        return {
          ingredient_id: "",
          ingredient_name: key,
          reported_qty: n,
          unit: "g",
          store_location: "",
          source: "entered",
        } as MaterialLine;
      })
      .filter(m => m !== null) as MaterialLine[];

    try {
      await onReport({
        packs: packsValue,
        grams: gramsValue,
        manufacturedAt,
        result: outcome,
        leftover: leftoverPayload,
        materials,
      });
      onSubmitted?.();
    } catch {
      // keep form open
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-3 space-y-3">
        <div className="text-sm font-medium">レシピ：{flavor.liquidName}</div>
        {flavor.recipe.map(r => {
          const key = r.ingredient;
          return (
            <div key={key} className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={!!checked[key]}
                  onCheckedChange={value =>
                    setChecked(prev => ({
                      ...prev,
                      [key]: Boolean(value),
                    }))
                  }
                />
                <div>
                  <div className="text-sm font-medium">{key}</div>
                  <div className="text-xs text-muted-foreground">
                    目安 {expected[key]?.toLocaleString?.() ?? 0} g
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="w-28 text-right"
                  type="number"
                  inputMode="decimal"
                  disabled={!checked[key]}
                  value={reported[key] ?? ""}
                  onChange={e => {
                    const raw = e.target.value ?? "";
                    setReported(prev => ({
                      ...prev,
                      [key]: raw,
                    }));
                  }}
                />
                <span className="text-sm text-muted-foreground">g</span>
              </div>
            </div>
          );
        })}
      </div>
      {showPackInput ? (
        <div className="grid md:grid-cols-3 gap-3 bg-muted/30 rounded-md p-3 items-end">
          <div className="md:col-span-2">
            <Label>今回作成パック数</Label>
            <Input
              type="number"
              value={packsMadeInput}
              onChange={e => {
                const raw = e.target.value;
                setPacksMadeInput(raw);
                setPacksMade(Number.parseInt(raw || "0", 10));
              }}
            />
            <div className={`text-xs mt-1 ${tooMuch ? "text-red-600" : ""}`}>
              最大 残り {Math.max(0, remaining)} パック
            </div>
          </div>
          <div>
            <Label>製造日</Label>
            <Input
              type="date"
              value={manufacturedAt}
              onChange={e => setManufacturedAt(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-3 bg-muted/30 rounded-md p-3">
          {line.useType === "oem" && (
            <Field label="作成量">
              {formatGram(line.oemGrams || line.requiredGrams)}
            </Field>
          )}
          <Field label="製造日">
            <Input
              type="date"
              value={manufacturedAt}
              onChange={e => setManufacturedAt(e.target.value)}
            />
          </Field>
        </div>
      )}
      {mode === "split" && (
        <div className="text-xs text-muted-foreground">
          登録時にロット番号は <span className="font-mono">{order.lotId}-XX</span>（通し番号）として保存されます。
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-3 mt-2">
        <div>
          <Label>結果</Label>
          <Select value={outcome} onValueChange={(value: "extra" | "used") => setOutcome(value)}>
            <SelectTrigger>
              <SelectValue placeholder="選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="extra">余った</SelectItem>
              <SelectItem value="used">使い切った</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {outcome === "extra" && (
        <div className="grid md:grid-cols-2 gap-3 border rounded-xl p-3">
          <div>
            <Label>保管場所</Label>
            <Select value={leftLoc} onValueChange={setLeftLoc}>
              <SelectTrigger disabled={mastersLoading || locations.length === 0}>
                <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
              </SelectTrigger>
              <SelectContent>
                {locations.length
                  ? locations.map(l => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))
                  : selectFallback(mastersLoading)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>余り数量（g）</Label>
            <Input
              type="number"
              value={leftGramsInput}
              onChange={e => {
                const raw = e.target.value;
                setLeftGramsInput(raw);
                setLeftGrams(Number.parseInt(raw || "0", 10));
              }}
            />
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button
          disabled={
            busy ||
            !manufacturedAt ||
            (showPackInput && (packsMade <= 0 || tooMuch)) ||
            (outcome === "extra" && (!leftLoc || leftGrams <= 0)) ||
            outcome === ""
          }
          onClick={submit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

type OnsiteMakeFormProps = {
  open?: boolean;
  defaultFlavorId: string;
  factoryCode: string;
  onRegister: (
    factoryCode: string,
    flavorId: string,
    useType: "fissule" | "oem",
    useCode: string,
    producedG: number,
    manufacturedAt: string,
    oemPartner?: string,
    leftover?: { loc: string; grams: number },
    lotId?: string,
    materials?: MaterialLine[] | null,
    packs?: number,
  ) => Promise<void>;
  busy?: boolean;
  flavors: FlavorWithRecipe[];
  oemList: string[];
  findFlavor: (id: string) => FlavorWithRecipe;
  storageByFactory: Record<string, string[]>;
  mastersLoading: boolean;
  uses: { code: string; name: string; type: "fissule" | "oem" }[];
  onCancel?: () => void;
  onSubmitted?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
};

export function OnsiteMakeForm({
  open = true,
  defaultFlavorId,
  factoryCode,
  onRegister,
  busy,
  flavors,
  oemList,
  findFlavor,
  storageByFactory,
  mastersLoading,
  uses,
  onCancel,
  onSubmitted,
  submitLabel = "登録",
  cancelLabel = "キャンセル",
}: OnsiteMakeFormProps) {
  const [flavorId, setFlavorId] = useState(defaultFlavorId);
  const [manufacturedAt, setManufacturedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [useCode, setUseCode] = useState(uses[0]?.code ?? "");
  const [oemPartner, setOemPartner] = useState(oemList[0] ?? "");
  const [extraPacks, setExtraPacks] = useState<number | undefined>(undefined);
  const [extraMaterials, setExtraMaterials] = useState<MaterialLine[] | null>(null);
  const [outcome, setOutcome] = useState<"extra" | "used" | "">("");
  const [leftLoc, setLeftLoc] = useState("");
  const [leftG, setLeftG] = useState(0);
  const [leftGInput, setLeftGInput] = useState("");
  const flavor = findFlavor(flavorId);
  const flavorDisabled = mastersLoading || flavors.length === 0;
  const purposeDisabled = mastersLoading || uses.length === 0;
  const locations = storageByFactory[factoryCode] || [];
  const normalizedUseCode = useMemo(() => useCode.trim(), [useCode]);
  const selectedUse = useMemo(
    () => uses.find(u => u.code === normalizedUseCode) ?? uses.find(u => u.code === useCode),
    [uses, normalizedUseCode, useCode],
  );
  const derivedUseType: "fissule" | "oem" = selectedUse?.type === "oem" ? "oem" : "fissule";

  const extraTotalGrams = useMemo(() => {
    const ptg = Number(flavor?.packToGram ?? 0);
    const packs = typeof extraPacks === "number" && Number.isFinite(extraPacks) ? extraPacks : 0;
    return Math.max(0, Math.round(ptg * packs));
  }, [flavor, extraPacks]);

  const recommendedMaterials = useMemo<MaterialLine[]>(() => {
    const recipe = flavor?.recipe ?? [];
    const sum = recipe.reduce((s, r) => s + Number(r.qty || 0), 0);
    if (!sum || !extraTotalGrams) {
      return recipe.map(r => ({
        ingredient_name: r.ingredient,
        reported_qty: 0,
        unit: r.unit || "g",
        source: "entered",
      }));
    }
    return recipe.map(r => {
      const portion = Math.round((extraTotalGrams * Number(r.qty || 0)) / sum);
      return {
        ingredient_name: r.ingredient,
        reported_qty: portion,
        unit: r.unit || "g",
        source: "entered",
      };
    });
  }, [flavor, extraTotalGrams]);

  useEffect(() => {
    setExtraMaterials(null);
  }, [flavorId]);

  useEffect(() => {
    if (!uses.length) {
      if (useCode !== "") {
        setUseCode("");
      }
      return;
    }
    if (!useCode || !uses.some(u => u.code === useCode)) {
      setUseCode(uses[0].code);
    }
  }, [uses, useCode]);

  useEffect(() => {
    if (!open) return;
    setExtraMaterials(prev => {
      if (!recommendedMaterials.length) {
        return recommendedMaterials.map(m => ({ ...m }));
      }
      if (!prev || prev.length === 0) {
        return recommendedMaterials.map(m => ({ ...m }));
      }
      if (prev.length !== recommendedMaterials.length) {
        return recommendedMaterials.map(m => ({ ...m }));
      }
      const same = prev.every((m, idx) => {
        const rec = recommendedMaterials[idx];
        return (
          m.ingredient_name === rec.ingredient_name &&
          (m.unit || "g") === (rec.unit || "g") &&
          m.reported_qty === rec.reported_qty
        );
      });
      return same ? recommendedMaterials.map(m => ({ ...m })) : prev;
    });
  }, [open, recommendedMaterials]);

  useEffect(() => {
    if (open) {
      setFlavorId(defaultFlavorId);
      setUseCode(uses[0]?.code ?? "");
      setOemPartner(oemList[0] ?? "");
      setOutcome("");
      setLeftLoc("");
      setLeftG(0);
      setLeftGInput("");
      setExtraPacks(undefined);
      setExtraMaterials(null);
      setManufacturedAt(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open, defaultFlavorId, oemList, uses]);

  const submit = async () => {
    const packsToSend =
      typeof extraPacks === "number" && Number.isFinite(extraPacks) ? extraPacks : undefined;
    if (busy) return;
    if (packsToSend === undefined) return;
    if (extraTotalGrams <= 0) return;
    if (!normalizedUseCode) return;
    const leftover =
      outcome === "extra" && leftLoc && leftG > 0 ? { loc: leftLoc, grams: leftG } : undefined;
    const materialsToSend: MaterialLine[] = (extraMaterials ?? recommendedMaterials).map(m => {
      const qty = Number(m.reported_qty ?? 0);
      return {
        ingredient_id: m.ingredient_id,
        ingredient_name: m.ingredient_name,
        reported_qty: Number.isFinite(qty) ? qty : 0,
        unit: m.unit ?? "g",
        store_location: m.store_location,
        source: m.source ?? "entered",
      };
    });
    try {
      await onRegister(
        factoryCode,
        flavorId,
        derivedUseType,
        normalizedUseCode,
        extraTotalGrams,
        manufacturedAt,
        derivedUseType === "oem" ? oemPartner : undefined,
        leftover,
        undefined,
        materialsToSend,
        packsToSend,
      );
      onSubmitted?.();
    } catch {
      // keep form open
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>今回作成パック数</Label>
        <Input
          type="number"
          value={extraPacks ?? ""}
          onChange={e => {
            const raw = e.target.value;
            const v = Number.parseInt(raw, 10);
            setExtraPacks(raw === "" ? undefined : Number.isFinite(v) ? Math.max(0, v) : undefined);
          }}
          inputMode="numeric"
          placeholder="数字を入力してください"
          required
        />
        <div className="text-xs text-muted-foreground mt-1">
          目安必要量: {formatGram(extraTotalGrams)}
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-1">
          <Label>レシピ</Label>
          <Select value={flavorId} onValueChange={setFlavorId}>
            <SelectTrigger disabled={flavorDisabled}>
              <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
            </SelectTrigger>
            <SelectContent>
              {flavors.length
                ? flavors.map(fl => (
                    <SelectItem key={fl.id} value={fl.id}>
                      {fl.flavorName}
                    </SelectItem>
                  ))
                : selectFallback(mastersLoading)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>用途</Label>
          <Select value={useCode} onValueChange={setUseCode}>
            <SelectTrigger disabled={purposeDisabled}>
              <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
            </SelectTrigger>
            <SelectContent>
              {uses.length
                ? uses.map(u => (
                    <SelectItem key={u.code} value={u.code}>
                      {u.name}
                    </SelectItem>
                  ))
                : selectFallback(mastersLoading)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>製造日</Label>
          <Input
            type="date"
            value={manufacturedAt}
            onChange={e => setManufacturedAt(e.target.value)}
          />
        </div>
      </div>
      <div className="rounded-xl border p-3 space-y-3">
        <div className="text-sm font-medium">レシピ：{flavor.liquidName}</div>
        {(extraMaterials ?? recommendedMaterials).map((m, idx) => (
          <div key={`${m.ingredient_name}-${idx}`} className="flex items-center gap-3">
            <div className="flex-1">{m.ingredient_name}</div>
            <div className="flex items-center gap-2">
              <Input
                className="w-28"
                type="number"
                value={(extraMaterials ?? recommendedMaterials)[idx]?.reported_qty ?? 0}
                onChange={e => {
                  const v = Number.parseInt(e.target.value || "0", 10);
                  setExtraMaterials(cur => {
                    const base = (cur && cur.length ? cur : recommendedMaterials).map(x => ({
                      ...x,
                    }));
                    if (!base[idx]) {
                      const rec = recommendedMaterials[idx] ?? m;
                      base[idx] = { ...rec };
                    }
                    base[idx].reported_qty = Number.isFinite(v) ? v : 0;
                    return base;
                  });
                }}
              />
              <span className="text-sm opacity-70">{m.unit || "g"}</span>
            </div>
          </div>
        ))}
        <div className="text-right text-sm">
          作成量 合計：<span className="font-semibold">{formatGram(extraTotalGrams)}</span>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label>結果</Label>
          <Select value={outcome} onValueChange={(value: "used" | "extra") => setOutcome(value)}>
            <SelectTrigger>
              <SelectValue placeholder="選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="used">使い切った</SelectItem>
              <SelectItem value="extra">余った</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {outcome === "extra" && (
          <>
            <div>
              <Label>保管場所</Label>
              <Select value={leftLoc} onValueChange={setLeftLoc}>
                <SelectTrigger disabled={mastersLoading || locations.length === 0}>
                  <SelectValue placeholder={mastersLoading ? "読み込み中..." : "未設定"} />
                </SelectTrigger>
                <SelectContent>
                  {locations.length
                    ? locations.map(l => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))
                    : selectFallback(mastersLoading)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>余り数量（g）</Label>
              <Input
                type="number"
                value={leftGInput}
                onChange={e => {
                  const raw = e.target.value;
                  setLeftGInput(raw);
                  setLeftG(Number.parseInt(raw || "0", 10));
                }}
              />
            </div>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button
          disabled={
            busy ||
            extraTotalGrams <= 0 ||
            !manufacturedAt ||
            !normalizedUseCode ||
            (derivedUseType === "oem" && !oemPartner) ||
            (outcome === "extra" && (!leftLoc || leftG <= 0)) ||
            outcome === ""
          }
          onClick={submit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1 min-w-[120px]">
    <div className="inline-flex items-center rounded-md bg-slate-800 text-white px-2 py-0.5 text-[11px] tracking-wide">
      {label}
    </div>
    <div className="text-sm font-medium leading-tight">{children}</div>
  </div>
);
