import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Share2, Copy, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Affiliate = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  code: string;
  commissionPercent: number;
  totalEarned: number;
  totalPaid: number;
  active: boolean;
};

async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

export default function Affiliates() {
  const [list, setList] = useState<Affiliate[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Affiliate | null>(null);
  const [payoutFor, setPayoutFor] = useState<Affiliate | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [form, setForm] = useState({ name: "", phone: "", email: "", code: "", commissionPercent: "10", active: true });

  async function load() {
    setLoading(true);
    try { setList(await api("/affiliates")); }
    catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", code: "", commissionPercent: "10", active: true });
    setOpen(true);
  }
  function openEdit(a: Affiliate) {
    setEditing(a);
    setForm({ name: a.name, phone: a.phone, email: a.email || "", code: a.code, commissionPercent: String(a.commissionPercent), active: a.active });
    setOpen(true);
  }

  async function save() {
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        ...(form.code ? { code: form.code } : {}),
        commissionPercent: parseFloat(form.commissionPercent),
        active: form.active,
      };
      if (editing) {
        await api(`/affiliates/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "تم التعديل" });
      } else {
        await api("/affiliates", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "تمت الإضافة" });
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: (e as Error).message });
    }
  }

  async function remove(id: number) {
    if (!confirm("حذف المسوّق؟")) return;
    await api(`/affiliates/${id}`, { method: "DELETE" });
    void load();
  }

  async function pay() {
    if (!payoutFor) return;
    try {
      await api(`/affiliates/${payoutFor.id}/payout`, { method: "POST", body: JSON.stringify({ amount: parseFloat(payoutAmount) }) });
      toast({ title: "تم تسجيل الدفعة" });
      setPayoutFor(null);
      setPayoutAmount("");
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  function copyLink(code: string) {
    const link = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(link);
    toast({ title: "تم نسخ رابط الإحالة" });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">المسوّقون</h1>
          <p className="text-muted-foreground mt-1">برنامج التسويق بالعمولة</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" />إضافة مسوّق</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل مسوّق" : "مسوّق جديد"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الجوال</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>البريد (اختياري)</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الكود (تلقائي إذا فارغ)</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
                <div><Label>نسبة العمولة %</Label><Input type="number" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between"><Label>نشط</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>{editing ? "حفظ" : "إضافة"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الاسم</TableHead><TableHead>الجوال</TableHead><TableHead>الكود</TableHead>
            <TableHead>العمولة %</TableHead><TableHead>المكتسب</TableHead><TableHead>المدفوع</TableHead>
            <TableHead>المتبقي</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={9} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            : list.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-12">
                <Share2 className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا يوجد مسوّقون بعد</p>
              </TableCell></TableRow>
            : list.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>{a.phone}</TableCell>
                <TableCell>
                  <span className="font-mono">{a.code}</span>
                  <Button variant="ghost" size="icon" onClick={() => copyLink(a.code)}><Copy className="h-3 w-3" /></Button>
                </TableCell>
                <TableCell>{a.commissionPercent}%</TableCell>
                <TableCell>{a.totalEarned.toFixed(2)} ر.س</TableCell>
                <TableCell>{a.totalPaid.toFixed(2)} ر.س</TableCell>
                <TableCell className="font-bold">{(a.totalEarned - a.totalPaid).toFixed(2)} ر.س</TableCell>
                <TableCell><Badge variant={a.active ? "default" : "secondary"}>{a.active ? "نشط" : "موقوف"}</Badge></TableCell>
                <TableCell className="text-left">
                  <Button variant="ghost" size="icon" title="تسجيل دفعة" onClick={() => { setPayoutFor(a); setPayoutAmount(String(Math.max(0, a.totalEarned - a.totalPaid))); }}><Wallet className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!payoutFor} onOpenChange={(o) => !o && setPayoutFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تسجيل دفعة عمولة لـ {payoutFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>المبلغ المدفوع (ر.س)</Label><Input type="number" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={pay}>تسجيل</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
