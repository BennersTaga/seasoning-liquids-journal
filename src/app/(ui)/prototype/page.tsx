'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useMemo, useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Warehouse, Archive, Beaker, Factory, Trash2, Boxes, ChefHat } from "lucide-react";
import { format } from "date-fns";

// ==== masters & utils (short) ====
const factories = [{ code: "GT", name: "玄天" }, { code: "HN", name: "羽野" }];
const storageByFactory: Record<string, string[]> = { GT: ["冷蔵庫"], HN: ["捌き手冷蔵庫", "氷感庫", "縦型冷蔵庫", "SCMパレット(華子パレット)"] };
const flavors = [
  { id: "tomato_umami", flavorName: "旨味トマト", liquidName: "旨味トマト調味液", packToGram: 850, expiryDays: 21, recipe: [
    { ingredient: "砂糖", qty: 1200, unit: "g" }, { ingredient: "食塩", qty: 400, unit: "g" }, { ingredient: "トマトペースト", qty: 2000, unit: "g" },
  ]},
  { id: "herb_marinade", flavorName: "ハーブマリネオイル", liquidName: "ハーブマリネオイル調味液", packToGram: 900, expiryDays: 21, recipe: [
    { ingredient: "オリーブオイル", qty: 3000, unit: "g" }, { ingredient: "ハーブMIX", qty: 120, unit: "g" }, { ingredient: "にんにく", qty: 60, unit: "g" },
  ]},
];
const oemList = ["F社ブランド", "G社ブランド", "H社ブランド"];
const findFlavor = (id: string) => flavors.find(f => f.id === id)!;
const grams = (n: number) => `${n.toLocaleString()} g`;
const genLotId = (factoryCode: string, seq: number, d = new Date()) => `${factoryCode}-${format(d, "yyyyMMdd")}-${String(seq).padStart(3, "0")}`;
const genOnsiteLotId = (factoryCode: string, seq2: number, d = new Date()) => `${factoryCode}-${format(d, "yyyyMMdd")}-9${String(seq2 % 100).padStart(2, "0")}`;
const calcExpiry = (manufacturedAt: string, flavorId: string) => { const days = findFlavor(flavorId)?.expiryDays ?? 21; const d = new Date(manufacturedAt); d.setDate(d.getDate() + days); return format(d, "yyyy-MM-dd"); };
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1 min-w-[120px]"><div className="inline-flex items-center rounded-md bg-slate-800 text-white px-2 py-0.5 text-[11px] tracking-wide">{label}</div><div className="text-sm font-medium leading-tight">{children}</div></div>
);

// ==== types ====
interface OrderLine { flavorId: string; packs: number; requiredGrams: number; useType: 'fissule'|'oem'; oemPartner?: string; oemGrams?: number; }
interface OrderCard { orderId: string; lotId: string; factoryCode: string; orderedAt: string; lines: OrderLine[]; archived?: boolean; }
interface StorageEntry { lotId: string; factoryCode: string; location: string; grams: number; flavorId: string; manufacturedAt: string; }

// ==== app ====
export default function App(){
  const [tab,setTab]=useState("office");
  const [orders,setOrders]=useState<OrderCard[]>([
    {orderId:"O-001",lotId:genLotId("GT",1),factoryCode:"GT",orderedAt:format(new Date(),"yyyy-MM-dd"),lines:[{flavorId:"tomato_umami",packs:160,requiredGrams:160*findFlavor("tomato_umami").packToGram,useType:'fissule'}]},
    {orderId:"O-002",lotId:genLotId("GT",2),factoryCode:"GT",orderedAt:format(new Date(),"yyyy-MM-dd"),lines:[{flavorId:"herb_marinade",packs:80,requiredGrams:80*findFlavor("herb_marinade").packToGram,useType:'fissule'}]},
    {orderId:"O-003",lotId:genLotId("HN",3),factoryCode:"HN",orderedAt:format(new Date(),"yyyy-MM-dd"),lines:[{flavorId:"tomato_umami",packs:0,requiredGrams:50000,useType:'oem',oemPartner:"F社ブランド",oemGrams:50000}]},
  ]);
  const [seq,setSeq]=useState(4); const [onsiteSeq,setOnsiteSeq]=useState(1); const [storage,setStorage]=useState<StorageEntry[]>([]);
  useEffect(()=>{console.assert(factories.length&&flavors.length);console.assert(orders.every(o=>o.lines.length===1));},[]);
  const registerOnsiteMake=(factoryCode:string,flavorId:string,useType:'fissule'|'oem',producedG:number,manufacturedAt:string,oemPartner?:string,leftover?:{loc:string;grams:number})=>{const lot=genOnsiteLotId(factoryCode,onsiteSeq,new Date(manufacturedAt));const newOrder:OrderCard={orderId:`OS-${String(onsiteSeq).padStart(3,'0')}`,lotId:lot,factoryCode,orderedAt:manufacturedAt,archived:true,lines:[useType==='fissule'?{flavorId,packs:0,requiredGrams:producedG,useType}:{flavorId,packs:0,requiredGrams:producedG,useType,oemPartner,oemGrams:producedG}]};setOrders(p=>[newOrder,...p]);if(leftover&&leftover.grams>0){setStorage(p=>[...p,{lotId:lot,factoryCode,flavorId,location:leftover.loc,grams:leftover.grams,manufacturedAt}]);}setOnsiteSeq(s=>s+1)};
  return (<div className="min-h-screen bg-orange-50 p-6 mx-auto max-w-7xl space-y-6"><header className="flex items-center justify-between"><h1 className="text-2xl font-semibold">調味液日報 UI プロトタイプ</h1><div className="text-sm opacity-80">/office と /floor を切替</div></header>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="grid grid-cols-2 w-full md:w-96"><TabsTrigger value="office" className="flex gap-2"><Factory className="h-4 w-4"/>Office（5F/管理）</TabsTrigger><TabsTrigger value="floor" className="flex gap-2"><Boxes className="h-4 w-4"/>Floor（現場）</TabsTrigger></TabsList>
      <TabsContent value="office" className="mt-6"><Office orders={orders} setOrders={setOrders} seq={seq} setSeq={setSeq}/></TabsContent>
      <TabsContent value="floor" className="mt-6"><Floor orders={orders} setOrders={setOrders} storage={storage} setStorage={setStorage} registerOnsiteMake={registerOnsiteMake}/></TabsContent>
    </Tabs>
    <footer className="text-xs text-center text-muted-foreground opacity-70">MVPプロトタイプ・ローカル状態のみ</footer></div>);
}

function Office({orders,setOrders,seq,setSeq}:{orders:OrderCard[];setOrders:(x:OrderCard[])=>void;seq:number;setSeq:(n:number)=>void;}){
  const [factory,setFactory]=useState(factories[0].code); const [flavor,setFlavor]=useState(flavors[0].id); const [useType,setUseType]=useState<'fissule'|'oem'>('fissule'); const [packs,setPacks]=useState(100); const [oemPartner,setOemPartner]=useState(oemList[0]); const [oemGrams,setOemGrams]=useState(0);
  const buildLine=(flavorId:string,useType:'fissule'|'oem',packs:number,oemPartner?:string,oemG?:number):OrderLine=> useType==='fissule'?{flavorId,packs,requiredGrams:packs*findFlavor(flavorId).packToGram,useType}:{flavorId,packs:0,requiredGrams:Math.max(0,oemG||0),useType,oemPartner,oemGrams:Math.max(0,oemG||0)};
  const createOrder=()=>{const today=new Date();const lot=genLotId(factory,seq,today);const line=buildLine(flavor,useType,packs,oemPartner,oemGrams);if((useType==='fissule'&&packs<=0)||(useType==='oem'&&(!oemPartner||(oemGrams||0)<=0)))return;const newOrder:OrderCard={orderId:`O-${String(seq).padStart(3,"0")}`,lotId:lot,factoryCode:factory,orderedAt:format(today,"yyyy-MM-dd"),lines:[line]};setOrders([newOrder,...orders]);setSeq(seq+1)};
  return (<div className="grid md:grid-cols-2 gap-6">
    <Card className="shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5"/>製造指示チケットの作成</CardTitle></CardHeader><CardContent className="space-y-4">
      <div><Label>製造場所</Label><Select value={factory} onValueChange={setFactory}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent>{factories.map(f=> <SelectItem key={f.code} value={f.code}>{f.name}（{f.code}）</SelectItem>)}</SelectContent></Select></div>
      {useType==='fissule'? (<div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div><Label>味付け</Label><Select value={flavor} onValueChange={setFlavor}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{flavors.map(fl=> <SelectItem key={fl.id} value={fl.id}>{fl.flavorName}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>用途</Label><Select value={useType} onValueChange={setUseType as any}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="fissule">Fissule</SelectItem><SelectItem value="oem">OEM</SelectItem></SelectContent></Select></div>
        <div><Label>パック数</Label><Input type="number" value={packs} onChange={e=>setPacks(parseInt(e.target.value||"0"))}/><div className="text-xs text-muted-foreground mt-1">必要量: {grams(packs*findFlavor(flavor).packToGram)}</div></div>
      </div>) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div><Label>味付け</Label><Select value={flavor} onValueChange={setFlavor}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{flavors.map(fl=> <SelectItem key={fl.id} value={fl.id}>{fl.flavorName}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>用途</Label><Select value={useType} onValueChange={setUseType as any}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="fissule">Fissule</SelectItem><SelectItem value="oem">OEM</SelectItem></SelectContent></Select></div>
          <div><Label>OEM先</Label><Select value={oemPartner} onValueChange={setOemPartner}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{oemList.map(x=> <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
          <div className="md:col-span-3"><Label>作成グラム数（g）</Label><Input type="number" value={oemGrams} onChange={e=>setOemGrams(parseInt(e.target.value||"0"))}/></div>
        </div>) }
      <div className="flex gap-3"><Button onClick={createOrder}>チケットを登録</Button><div className="text-sm text-muted-foreground flex items-center gap-2"><Beaker className="h-4 w-4"/><span>パック→g は味付け設定で自動換算</span></div></div>
    </CardContent></Card>

    <Card className="shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5"/>進捗（未アーカイブ）</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-h-[540px] overflow-auto pr-2">
        {orders.filter(o=>!o.archived).map(order=> (
          <div key={order.orderId} className="border rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">{order.lotId} <Badge variant="secondary" className="ml-2">{factories.find(f=>f.code===order.factoryCode)?.name}</Badge></div><div className="text-xs opacity-70">指示日 {order.orderedAt}</div></div>
            {order.lines.map((ln,i)=>{const f=findFlavor(ln.flavorId);return (
              <div key={i} className="text-sm grid gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Field label="味付け">{f.flavorName}</Field><Field label="用途">{ln.useType==='oem'? 'OEM':'Fissule'}</Field></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Field label={ln.useType==='fissule'? 'パック数':'OEM先'}>{ln.useType==='fissule'? ln.packs: ln.oemPartner}</Field><Field label="必要量"><span className="font-semibold">{grams(ln.requiredGrams)}</span></Field></div>
              </div> );})}
          </div>))}
        {orders.filter(o=>!o.archived).length===0 && <div className="text-sm text-muted-foreground">未処理の指示はありません</div>}
      </CardContent>
      <CardFooter className="justify-end"><Badge variant="outline" className="gap-1"><Archive className="h-3 w-3"/> アーカイブは現場側から</Badge></CardFooter>
    </Card>
  </div>);
}

function Floor({orders,setOrders,storage,setStorage,registerOnsiteMake}:{orders:OrderCard[];setOrders:React.Dispatch<React.SetStateAction<OrderCard[]>>;storage:StorageEntry[];setStorage:React.Dispatch<React.SetStateAction<StorageEntry[]>>;registerOnsiteMake:(factoryCode:string,flavorId:string,useType:'fissule'|'oem',producedG:number,manufacturedAt:string,oemPartner?:string,leftover?:{loc:string;grams:number})=>void;}){
  const [factory,setFactory]=useState(factories[0].code); const [extraOpen,setExtraOpen]=useState(false);
  const openOrders=useMemo(()=>orders.filter(o=>!o.archived&&o.factoryCode===factory),[orders,factory]);
  const storageAgg=useMemo(()=>{const map=new Map<string,{lotId:string;grams:number;locations:Set<string>;flavorId:string;manufacturedAt:string}>();for(const s of storage.filter(s=>s.factoryCode===factory)){const k=s.lotId;const e=map.get(k)||{lotId:k,grams:0,locations:new Set<string>(),flavorId:s.flavorId,manufacturedAt:s.manufacturedAt};e.grams+=s.grams;e.locations.add(s.location);if(!e.manufacturedAt)e.manufacturedAt=s.manufacturedAt;map.set(k,e);}return Array.from(map.values());},[storage,factory]);
  return (<div className="grid md:grid-cols-2 gap-6 items-start">
    <div className="flex items-center gap-3"><Label>製造場所</Label><Select value={factory} onValueChange={setFactory}><SelectTrigger className="w-56"><SelectValue/></SelectTrigger><SelectContent>{factories.map(f=> <SelectItem key={f.code} value={f.code}>{f.name}（{f.code}）</SelectItem>)}</SelectContent></Select></div>
    <div className="md:col-span-2 grid md:grid-cols-2 gap-6">
      <KanbanColumn title="製造指示" icon={<ChefHat className="h-4 w-4"/>} rightSlot={<Button variant="outline" onClick={()=>setExtraOpen(true)} className="gap-1"><Plus className="h-4 w-4"/>追加で作成</Button>}>
        {openOrders.map(o=> <OrderCardView key={o.orderId} order={o} onArchive={()=>setOrders(orders.map(od=>od.orderId===o.orderId?{...od,archived:true}:od))} onAddStorage={e=>setStorage([...storage,...e])}/>) }
        {openOrders.length===0 && <Empty>ここにカードが表示されます</Empty>}
      </KanbanColumn>
      <KanbanColumn title="保管（在庫）" icon={<Warehouse className="h-4 w-4"/>}>
        {storageAgg.map(sa=> <StorageCardView key={sa.lotId} agg={sa} onUse={(qty,leftoverQty,location)=>{setStorage(p=>[...p,{lotId:sa.lotId,factoryCode:factory,flavorId:sa.flavorId,location,grams:-qty,manufacturedAt:sa.manufacturedAt}]);if(leftoverQty>0)setStorage(p=>[...p,{lotId:sa.lotId,factoryCode:factory,flavorId:sa.flavorId,location,grams:leftoverQty,manufacturedAt:sa.manufacturedAt}]);}} onWaste={(qtyOrText,reason,location)=>{if(typeof qtyOrText==='number'){setStorage(p=>[...p,{lotId:sa.lotId,factoryCode:factory,flavorId:sa.flavorId,location,grams:-Math.abs(qtyOrText),manufacturedAt:sa.manufacturedAt}]);}}}/>) }
        {storageAgg.length===0 && <Empty>余剰の在庫はここに集計されます</Empty>}
      </KanbanColumn>
    </div>
    <OnsiteMakeDialog open={extraOpen} onClose={()=>setExtraOpen(false)} defaultFlavorId={flavors[0].id} factoryCode={factory} onRegister={registerOnsiteMake}/>
  </div>);
}

function KanbanColumn({title,icon,rightSlot,children}:{title:string;icon?:React.ReactNode;rightSlot?:React.ReactNode;children:React.ReactNode;}){
  return (<Card className="shadow-sm"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>{rightSlot}</div></CardHeader><CardContent className="space-y-3 max-h-[560px] overflow-auto pr-1">{children}</CardContent></Card>);
}
const Empty=({children}:{children:React.ReactNode})=> (<div className="text-sm text-muted-foreground border rounded-xl p-6 text-center">{children}</div>);

function OrderCardView({order,onArchive,onAddStorage}:{order:OrderCard;onArchive:()=>void;onAddStorage:(e:StorageEntry[])=>void;}){
  const [open,setOpen]=useState<null|"keep"|"made"|"skip">(null); const ln=order.lines[0]; const flavor=findFlavor(ln.flavorId); const reset=()=>setOpen(null);
  return (<Card className="border rounded-xl"><CardContent className="pt-4 space-y-3">
    <div className="flex items-center justify-between"><div className="font-medium">{order.lotId} <Badge variant="secondary" className="ml-2">{order.factoryCode}</Badge></div><div className="text-xs opacity-70">指示日 {order.orderedAt}</div></div>
    <div className="text-sm grid gap-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Field label="味付け">{flavor.flavorName}</Field><Field label="用途">{ln.useType==='oem'? 'OEM':'Fissule'}</Field></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">{ln.useType==='fissule' && <Field label="パック数">{ln.packs}</Field>}{ln.useType==='oem' && <Field label="OEM先">{ln.oemPartner}</Field>}<Field label="必要量">{grams(ln.requiredGrams)}</Field></div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setOpen("keep")}>保管</Button><Button onClick={()=>setOpen("made")}>作った</Button><Button variant="secondary" onClick={()=>setOpen("skip")}>作らない</Button></div>
  </CardContent>
  <KeepDialog open={open==="keep"} onClose={reset} factoryCode={order.factoryCode} onSubmit={(loc,g,mfg)=>{onAddStorage([{lotId:order.lotId,factoryCode:order.factoryCode,location:loc,grams:g,flavorId:ln.flavorId,manufacturedAt:mfg}]);onArchive();reset();}}/>
  <MadeDialog open={open==="made"} onClose={reset} order={order} onArchive={onArchive} onAddStorage={onAddStorage}/>
  <Dialog open={open==="skip"} onOpenChange={(o)=>{if(!o)reset();}}><DialogContent><DialogHeader><DialogTitle>作らない理由（任意）</DialogTitle></DialogHeader></DialogContent></Dialog>
  </Card>);
}

function KeepDialog({open,onClose,factoryCode,onSubmit}:{open:boolean;onClose:()=>void;factoryCode:string;onSubmit:(location:string,grams:number,manufacturedAt:string)=>void;}){
  const [loc,setLoc]=useState(""); const [g,setG]=useState(0); const [mfg,setMfg]=useState(format(new Date(),"yyyy-MM-dd")); const locs=storageByFactory[factoryCode]||[];
  return (<Dialog open={open} onOpenChange={(o)=>{if(!o)onClose();}}><DialogContent><DialogHeader><DialogTitle>保管登録</DialogTitle></DialogHeader>
    <div className="grid gap-3"><div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div><Label>保管場所</Label><Select value={loc} onValueChange={setLoc}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent>{locs.map(l=> <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>数量（g）</Label><Input type="number" value={g} onChange={e=>setG(parseInt(e.target.value||"0"))}/></div>
      <div><Label>製造日</Label><Input type="date" value={mfg} onChange={e=>setMfg(e.target.value)}/></div>
    </div></div>
    <DialogFooter><Button variant="secondary" onClick={onClose}>キャンセル</Button><Button disabled={!loc||g<=0||!mfg} onClick={()=>onSubmit(loc,g,mfg)}>登録</Button></DialogFooter>
  </DialogContent></Dialog>);
}

function MadeDialog({open,onClose,order,onArchive,onAddStorage}:{open:boolean;onClose:()=>void;order:OrderCard;onArchive:()=>void;onAddStorage:(e:StorageEntry[])=>void;}){
  const [checked,setChecked]=useState<Record<string,boolean>>({}); const [recipeQty,setRecipeQty]=useState<Record<string,number>>({}); const [outcome,setOutcome]=useState<'extra'|'used'|''>(''); const [leftLoc,setLeftLoc]=useState(""); const [leftG,setLeftG]=useState(0); const [mfg,setMfg]=useState(format(new Date(),"yyyy-MM-dd"));
  const firstLine=order.lines[0]; const flavor=findFlavor(firstLine.flavorId); const allChecked=flavor.recipe.every(r=>checked[r.ingredient]);
  useEffect(()=>{ if(open){ const init:Record<string,number>={}; flavor.recipe.forEach(r=>{init[r.ingredient]=r.qty}); setRecipeQty(init); setChecked({}); } },[open,flavor]);
  const submit=()=>{ if(outcome==='extra'){ if(leftG>0&&leftLoc) onAddStorage([{lotId:order.lotId,factoryCode:order.factoryCode,location:leftLoc,grams:leftG,flavorId:flavor.id,manufacturedAt:mfg}]); onArchive(); } else if(outcome==='used'){ onArchive(); } onClose(); };
  return (<Dialog open={open} onOpenChange={(o)=>{if(!o)onClose();}}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>作った（レシピ確認 → 結果）</DialogTitle></DialogHeader>
    <div className="rounded-xl border p-3 space-y-3"><div className="text-sm font-medium">レシピ：{flavor.liquidName}</div>
      {flavor.recipe.map((r,idx)=> (<div key={idx} className="flex items-center justify-between gap-3 px-1"><div className="flex items-center gap-2"><Checkbox id={`ing-${idx}`} checked={!!checked[r.ingredient]} onCheckedChange={(v)=>setChecked({...checked,[r.ingredient]:Boolean(v)})}/><Label htmlFor={`ing-${idx}`}>{r.ingredient}</Label></div><div className="flex items-center gap-2"><Input className="w-24" type="number" value={recipeQty[r.ingredient]??r.qty} onChange={(e)=>setRecipeQty({...recipeQty,[r.ingredient]:parseInt(e.target.value||'0')})}/><span className="text-sm opacity-80">{r.unit}</span></div></div>))}
    </div>
    {firstLine.useType==='oem'? (<div className="grid md:grid-cols-3 gap-3 bg-muted/30 rounded-md p-3"><Field label="OEM先">{firstLine.oemPartner}</Field><Field label="作成量">{grams(firstLine.oemGrams||firstLine.requiredGrams)}</Field><Field label="製造日"><Input type="date" value={mfg} onChange={(e)=>setMfg(e.target.value)}/></Field></div>) : (<div className="grid md:grid-cols-3 gap-3 bg-muted/30 rounded-md p-3"><Field label="必要量">{grams(firstLine.requiredGrams)}</Field><Field label="製造日"><Input type="date" value={mfg} onChange={(e)=>setMfg(e.target.value)}/></Field></div>)}
    <div className="grid md:grid-cols-3 gap-3">
      <div><Label>結果</Label><Select value={outcome} onValueChange={(v:any)=>setOutcome(v)}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent><SelectItem value="extra">余った</SelectItem><SelectItem value="used">使い切った</SelectItem></SelectContent></Select></div>
    </div>

    {(outcome==='extra') && (<div className="grid md:grid-cols-2 gap-3 border rounded-xl p-3"><div><Label>保管場所</Label><Select value={leftLoc} onValueChange={setLeftLoc}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent>{(storageByFactory[order.factoryCode]||[]).map(l=> <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div><div><Label>余り数量（g）</Label><Input type="number" value={leftG} onChange={e=>setLeftG(parseInt(e.target.value||"0"))}/></div></div>)}
    <DialogFooter><Button variant="secondary" onClick={onClose}>キャンセル</Button><Button disabled={!allChecked||!mfg||(outcome==='extra'&&(!leftLoc||leftG<=0))||outcome===''} onClick={submit}>登録してアーカイブ</Button></DialogFooter>
  </DialogContent></Dialog>);
}

function OnsiteMakeDialog({open,onClose,defaultFlavorId,factoryCode,onRegister}:{open:boolean;onClose:()=>void;defaultFlavorId:string;factoryCode:string;onRegister:(factoryCode:string,flavorId:string,useType:'fissule'|'oem',producedG:number,manufacturedAt:string,oemPartner?:string,leftover?:{loc:string;grams:number})=>void;}){
  const [flavorId,setFlavorId]=useState(defaultFlavorId); const f=findFlavor(flavorId); const [mfg,setMfg]=useState(format(new Date(),"yyyy-MM-dd")); const [useType,setUseType]=useState<'fissule'|'oem'>('fissule'); const [oemPartner,setOemPartner]=useState(oemList[0]); const [checked,setChecked]=useState<Record<string,boolean>>({}); const [qty,setQty]=useState<Record<string,number>>({}); const [outcome,setOutcome]=useState<'extra'|'used'|''>(''); const [leftLoc,setLeftLoc]=useState(""); const [leftG,setLeftG]=useState(0);
  const sum=Object.keys(qty).reduce((acc,k)=>acc+(checked[k]?(qty[k]||0):0),0); useEffect(()=>{setChecked({});setQty({});},[flavorId]);
  const submit=()=>{onRegister(factoryCode,flavorId,useType,sum,mfg,useType==='oem'?oemPartner:undefined,outcome==='extra'?{loc:leftLoc,grams:leftG}:undefined);onClose();};
  return (<Dialog open={open} onOpenChange={(o)=>{if(!o)onClose();}}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>追加で作成（現場報告）</DialogTitle></DialogHeader>
    <div className="grid md:grid-cols-3 gap-3"><div className="md:col-span-1"><Label>レシピ</Label><Select value={flavorId} onValueChange={setFlavorId}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{flavors.map(fl=> <SelectItem key={fl.id} value={fl.id}>{fl.flavorName}</SelectItem>)}</SelectContent></Select></div><div><Label>用途</Label><Select value={useType} onValueChange={setUseType as any}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="fissule">Fissule</SelectItem><SelectItem value="oem">OEM</SelectItem></SelectContent></Select></div><div><Label>製造日</Label><Input type="date" value={mfg} onChange={(e)=>setMfg(e.target.value)}/></div></div>
    {useType==='oem' && (<div><Label>OEM先</Label><Select value={oemPartner} onValueChange={setOemPartner}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{oemList.map(x=> <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>)}
    <div className="rounded-xl border p-3 space-y-3"><div className="text-sm font-medium">レシピ：{f.liquidName}</div>{f.recipe.map((r,idx)=> (<div key={idx} className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Checkbox id={`ing2-${idx}`} checked={!!checked[r.ingredient]} onCheckedChange={(v)=>setChecked({...checked,[r.ingredient]:Boolean(v)})}/><Label htmlFor={`ing2-${idx}`}>{r.ingredient}</Label></div><div className="flex items-center gap-2"><Input className="w-28" type="number" value={qty[r.ingredient]||0} onChange={(e)=>setQty({...qty,[r.ingredient]:parseInt(e.target.value||'0')})}/><span className="text-sm opacity-70">g</span></div></div>))}<div className="text-right text-sm">作成量 合計：<span className="font-semibold">{grams(sum)}</span></div></div>
    <div className="grid md:grid-cols-3 gap-3">
      <div><Label>結果</Label><Select value={outcome} onValueChange={(v:any)=>setOutcome(v)}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent><SelectItem value="used">使い切った</SelectItem><SelectItem value="extra">余った</SelectItem></SelectContent></Select></div>
    </div>
    {outcome==='extra' && (<><div><Label>保管場所</Label><Select value={leftLoc} onValueChange={setLeftLoc}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent>{(storageByFactory[factoryCode]||[]).map(l=> <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div><div><Label>余り数量（g）</Label><Input type="number" value={leftG} onChange={(e)=>setLeftG(parseInt(e.target.value||'0'))}/></div></>)}
    <DialogFooter><Button variant="secondary" onClick={onClose}>キャンセル</Button><Button disabled={sum<=0||!mfg||(useType==='oem'&&!oemPartner)||(outcome==='extra'&&(!leftLoc||leftG<=0))} onClick={submit}>登録</Button></DialogFooter>
  </DialogContent></Dialog>);
}

function StorageCardView({agg,onUse,onWaste}:{agg:{lotId:string;grams:number;locations:Set<string>;flavorId:string;manufacturedAt:string},onUse:(usedQty:number,leftover:number,location:string)=>void,onWaste:(qtyOrText:number|string,reason:'expiry'|'mistake'|'other',location:string)=>void}){
  const [useOpen,setUseOpen]=useState(false); const [wasteOpen,setWasteOpen]=useState(false);
  const [useQty,setUseQty]=useState(0); const [useOutcome,setUseOutcome]=useState<'extra'|'none'|'shortage'|''>(''); const [leftQty,setLeftQty]=useState(0); const [loc,setLoc]=useState<string>(Array.from(agg.locations)[0]||"");
  const [wasteReason,setWasteReason]=useState<'expiry'|'mistake'|'other'|''>(''); const [wasteQty,setWasteQty]=useState(0); const [wasteText,setWasteText]=useState("");
  const flavor=findFlavor(agg.flavorId); const expiry=calcExpiry(agg.manufacturedAt,agg.flavorId);
  return (<Card className="border rounded-xl"><CardContent className="pt-4 space-y-3">
    <div className="flex items-center justify-between"><div className="font-medium">{agg.lotId}</div></div>
    <div className="grid md:grid-cols-2 gap-4"><Field label="味付け">{flavor?.flavorName||'-'}</Field><Field label="保管場所">{Array.from(agg.locations).join(' / ')||'-'}</Field></div>
    <div className="grid md:grid-cols-3 gap-4"><Field label="製造日">{agg.manufacturedAt||'-'}</Field><Field label="賞味期限">{expiry}</Field><Field label="合計"><span className="font-semibold">{grams(agg.grams)}</span></Field></div>
    <div className="flex gap-2"><Button onClick={()=>setUseOpen(true)}>使う</Button><Button variant="destructive" onClick={()=>setWasteOpen(true)}><Trash2 className="h-4 w-4 mr-1"/>廃棄</Button></div>
  </CardContent>
  <Dialog open={useOpen} onOpenChange={setUseOpen}><DialogContent><DialogHeader><DialogTitle>在庫の使用</DialogTitle></DialogHeader>
    <div className="grid gap-3"><div className="grid grid-cols-2 gap-3"><div><Label>使用量（g）</Label><Input type="number" value={useQty} onChange={e=>setUseQty(parseInt(e.target.value||"0"))}/></div><div><Label>結果</Label><Select value={useOutcome} onValueChange={(v:any)=>setUseOutcome(v)}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent><SelectItem value="extra">余った</SelectItem><SelectItem value="none">余らず</SelectItem><SelectItem value="shortage">不足</SelectItem></SelectContent></Select></div></div>
      {(useOutcome==='extra') && (<div className="grid grid-cols-2 gap-3"><div><Label>余り数量（g）</Label><Input type="number" value={leftQty} onChange={e=>setLeftQty(parseInt(e.target.value||"0"))}/></div><div><Label>保管場所</Label><Select value={loc} onValueChange={setLoc}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Array.from(agg.locations).map(l=> <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div></div>)}
    </div>
    <DialogFooter><Button variant="secondary" onClick={()=>setUseOpen(false)}>キャンセル</Button><Button disabled={useQty<=0||(useOutcome==='extra'&&(leftQty<=0||!loc))} onClick={()=>{onUse(useQty,useOutcome==='extra'?leftQty:0,loc);setUseOpen(false);}}>登録</Button></DialogFooter>
  </DialogContent></Dialog>
  <Dialog open={wasteOpen} onOpenChange={setWasteOpen}><DialogContent><DialogHeader><DialogTitle>廃棄記録</DialogTitle></DialogHeader>
    <div className="grid gap-3"><div><Label>理由</Label><Select value={wasteReason} onValueChange={(v:any)=>setWasteReason(v)}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent><SelectItem value="expiry">賞味期限</SelectItem><SelectItem value="mistake">製造ミス</SelectItem><SelectItem value="other">その他</SelectItem></SelectContent></Select></div>
      {(wasteReason==='expiry'||wasteReason==='mistake') && (<div className="grid grid-cols-2 gap-3"><div><Label>廃棄量（g）</Label><Input type="number" value={wasteQty} onChange={e=>setWasteQty(parseInt(e.target.value||'0'))}/></div><div><Label>保管場所</Label><Select value={loc} onValueChange={setLoc}><SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger><SelectContent>{Array.from(agg.locations).map(l=> <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div></div>)}
      {wasteReason==='other' && (<div><Label>理由（自由記述）</Label><Input value={wasteText} onChange={(e)=>setWasteText(e.target.value)} placeholder="例）サンプル提供など"/></div>)}
    </div>
    <DialogFooter><Button variant="secondary" onClick={()=>setWasteOpen(false)}>キャンセル</Button><Button disabled={wasteReason===''||((wasteReason==='expiry'||wasteReason==='mistake')&&(wasteQty<=0||!loc))||(wasteReason==='other'&&wasteText.trim()==='')} onClick={()=>{if(wasteReason==='other'){onWaste(wasteText,'other',loc);}else{onWaste(wasteQty,wasteReason as any,loc);}setWasteOpen(false);}}>登録</Button></DialogFooter>
  </DialogContent></Dialog>
  </Card>);
}
