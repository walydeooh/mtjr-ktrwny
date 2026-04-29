import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Ticket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Coupon = {
  id: number;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minOrderAmount: number;
  maxUses: number | null;
  usedCount: number;
  startsAt?: string | null;
  expiresAt: string | null;
  applicableProductIds?: number[];
  excludedProductIds?: number[];
  active: boolean;
};
type Product = { id: number; name: string };

async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

export default function Coupons() {
  const [list, setList] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [form, setForm] = useState({
    code: "",
    discountType: "percent" as "percent" | "fixed",
    discountValue: "10",
    minOrderAmount: "0",
    maxUses: "",
    startsAt: "",
    expiresAt: "",
    scope: "all" as "all" | "include" | "exclude",
    productIds: [] as number[],
    active: true,
  });

  async function load() {
    setLoading(true);
    try {
      const [cs, ps] = await Promise.all([api("/coupons"), api("/products")]);
      setList(cs); setProducts(ps);
    } catch (e) {
      toast({ variant: "destructive", title: "تعذر التحميل", description: String((e as Error).message) });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ code: "", discountType: "percent", discountValue: "10", minOrderAmount: "0", maxUses: "", startsAt: "", expiresAt: "", scope: "all", productIds: [], active: true });
    setOpen(true);
  }
  function openEdit(c: Coupon) {
    setEditing(c);
    const incl = c.applicableProductIds || [];
    const excl = c.excludedProductIds || [];
    const scope: "all" | "include" | "exclude" = incl.length > 0 ? "include" : excl.length > 0 ? "exclude" : "all";
    setForm({
      code: c.code,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      minOrderAmount: String(c.minOrderAmount),
      maxUses: c.maxUses ? String(c.maxUses) : "",
      startsAt: c.startsAt ? c.startsAt.slice(0, 16) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 16) : "",
      scope,
      productIds: scope === "include" ? incl : excl,
      active: c.active,
    });
    setOpen(true);
  }

  async function save() {
    try {
      const payload: Record<string, unknown> = {
        code: form.code,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        minOrderAmount: parseFloat(form.minOrderAmount || "0"),
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        applicableProductIds: form.scope === "include" ? form.productIds : [],
        excludedProductIds: form.scope === "exclude" ? form.productIds : [],
        active: form.active,
      };
      if (editing) {
        await api(`/coupons/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "تم التعديل" });
      } else {
        await api("/coupons", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "تمت الإضافة" });
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: String((e as Error).message) });
    }
  }

  async function remove(id: number) {
    if (!confirm("حذف الكوبون؟")) return;
    await api(`/coupons/${id}`, { method: "DELETE" });
    void load();
  }

  function toggleProduct(id: number) {
    setForm((f) => ({ ...f, productIds: f.productIds.includes(id) ? f.productIds.filter((x) => x !== id) : [...f.productIds, id] }));
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">الكوبونات</h1>
          <p className="text-muted-foreground mt-1">أنشئ كوبونات خصم لجذب العملاء</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" />إضافة كوبون</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "تعديل كوبون" : "كوبون جديد"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>الكود</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>نوع الخصم</Label>
                  <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v as "percent" | "fixed" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">نسبة %</SelectItem>
                      <SelectItem value="fixed">قيمة ثابتة (ر.س)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>القيمة</Label>
                  <Input type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>الحد الأدنى للطلب</Label>
                  <Input type="number" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} />
                </div>
                <div>
                  <Label>عدد مرات الاستخدام (اختياري)</Label>
                  <Input type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="بلا حد" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاريخ بداية الصلاحية (اختياري)</Label>
                  <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </div>
                <div>
                  <Label>تاريخ الانتهاء (اختياري)</Label>
                  <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>نطاق التطبيق</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as typeof form.scope, productIds: [] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المنتجات</SelectItem>
                    <SelectItem value="include">منتجات محددة فقط</SelectItem>
                    <SelectItem value="exclude">جميع المنتجات ما عدا</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.scope !== "all" && (
                <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
                  {products.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">لا توجد منتجات</p>
                  ) : products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm">
                      <input type="checkbox" checked={form.productIds.includes(p.id)} onChange={() => toggleProduct(p.id)} />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label>مفعّل</Label>
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save}>{editing ? "حفظ التعديلات" : "إضافة"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الكود</TableHead>
              <TableHead>الخصم</TableHead>
              <TableHead>الحد الأدنى</TableHead>
              <TableHead>الاستخدام</TableHead>
              <TableHead>الصلاحية</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            ) : list.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12">
                <Ticket className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا توجد كوبونات بعد</p>
              </TableCell></TableRow>
            ) : list.map((c) => {
              const validity = c.startsAt && c.expiresAt
                ? `${new Date(c.startsAt).toLocaleDateString("ar-SA")} - ${new Date(c.expiresAt).toLocaleDateString("ar-SA")}`
                : c.expiresAt ? `حتى ${new Date(c.expiresAt).toLocaleDateString("ar-SA")}`
                : c.startsAt ? `من ${new Date(c.startsAt).toLocaleDateString("ar-SA")}` : "—";
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold">{c.code}</TableCell>
                  <TableCell>{c.discountType === "percent" ? `${c.discountValue}%` : `${c.discountValue} ر.س`}</TableCell>
                  <TableCell>{c.minOrderAmount > 0 ? `${c.minOrderAmount} ر.س` : "—"}</TableCell>
                  <TableCell>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ""}</TableCell>
                  <TableCell className="text-xs">{validity}</TableCell>
                  <TableCell><Badge variant={c.active ? "default" : "secondary"}>{c.active ? "مفعّل" : "موقوف"}</Badge></TableCell>
                  <TableCell className="text-left">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
