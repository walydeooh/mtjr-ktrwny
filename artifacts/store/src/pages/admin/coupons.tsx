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
  expiresAt: string | null;
  active: boolean;
};

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
    expiresAt: "",
    active: true,
  });

  async function load() {
    setLoading(true);
    try {
      setList(await api("/coupons"));
    } catch (e) {
      toast({ variant: "destructive", title: "تعذر تحميل الكوبونات", description: String((e as Error).message) });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ code: "", discountType: "percent", discountValue: "10", minOrderAmount: "0", maxUses: "", expiresAt: "", active: true });
    setOpen(true);
  }
  function openEdit(c: Coupon) {
    setEditing(c);
    setForm({
      code: c.code,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      minOrderAmount: String(c.minOrderAmount),
      maxUses: c.maxUses ? String(c.maxUses) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 16) : "",
      active: c.active,
    });
    setOpen(true);
  }

  async function save() {
    try {
      const payload = {
        code: form.code,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        minOrderAmount: parseFloat(form.minOrderAmount || "0"),
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
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
          <DialogContent dir="rtl">
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
              <div>
                <Label>تاريخ الانتهاء (اختياري)</Label>
                <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
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
              <TableHead>الانتهاء</TableHead>
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
            ) : list.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-bold">{c.code}</TableCell>
                <TableCell>{c.discountType === "percent" ? `${c.discountValue}%` : `${c.discountValue} ر.س`}</TableCell>
                <TableCell>{c.minOrderAmount > 0 ? `${c.minOrderAmount} ر.س` : "—"}</TableCell>
                <TableCell>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ""}</TableCell>
                <TableCell>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("ar-SA") : "—"}</TableCell>
                <TableCell><Badge variant={c.active ? "default" : "secondary"}>{c.active ? "مفعّل" : "موقوف"}</Badge></TableCell>
                <TableCell className="text-left">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
