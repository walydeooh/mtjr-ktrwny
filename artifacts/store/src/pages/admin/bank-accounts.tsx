import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BankAccount = {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string | null;
  iban: string;
  logoUrl: string | null;
  sortOrder: number;
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

export default function BankAccounts() {
  const [list, setList] = useState<BankAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [form, setForm] = useState({ bankName: "", accountName: "", accountNumber: "", iban: "", logoUrl: "", sortOrder: "0", active: true });

  async function load() {
    setLoading(true);
    try { setList(await api("/admin/bank-accounts")); }
    catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ bankName: "", accountName: "", accountNumber: "", iban: "", logoUrl: "", sortOrder: "0", active: true });
    setOpen(true);
  }
  function openEdit(b: BankAccount) {
    setEditing(b);
    setForm({
      bankName: b.bankName, accountName: b.accountName, accountNumber: b.accountNumber || "",
      iban: b.iban, logoUrl: b.logoUrl || "", sortOrder: String(b.sortOrder), active: b.active,
    });
    setOpen(true);
  }

  async function save() {
    try {
      const payload = {
        bankName: form.bankName,
        accountName: form.accountName,
        accountNumber: form.accountNumber || null,
        iban: form.iban,
        logoUrl: form.logoUrl || null,
        sortOrder: parseInt(form.sortOrder || "0", 10),
        active: form.active,
      };
      if (editing) {
        await api(`/bank-accounts/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "تم التعديل" });
      } else {
        await api("/bank-accounts", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "تمت الإضافة" });
      }
      setOpen(false);
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function remove(id: number) {
    if (!confirm("حذف الحساب البنكي؟")) return;
    await api(`/bank-accounts/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">الحسابات البنكية</h1>
          <p className="text-muted-foreground mt-1">أضف حسابات بنكية متعددة ليختار العميل منها عند التحويل</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" />حساب جديد</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل حساب بنكي" : "حساب بنكي جديد"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>اسم البنك *</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="البنك الأهلي" /></div>
              <div><Label>اسم صاحب الحساب *</Label><Input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>رقم الحساب (اختياري)</Label><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} dir="ltr" className="text-right font-mono" /></div>
                <div><Label>ترتيب العرض</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
              </div>
              <div><Label>الآيبان (IBAN) *</Label><Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="SA0000000000000000000000" dir="ltr" className="text-right font-mono" /></div>
              <div><Label>رابط شعار البنك (اختياري)</Label><Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." dir="ltr" className="text-right" /></div>
              <div className="flex items-center justify-between"><Label>نشط</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>{editing ? "حفظ" : "إضافة"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead></TableHead><TableHead>البنك</TableHead><TableHead>صاحب الحساب</TableHead>
            <TableHead>الآيبان</TableHead><TableHead>الترتيب</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            : list.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-12">
                <Banknote className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا توجد حسابات بنكية بعد</p>
              </TableCell></TableRow>
            : list.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.logoUrl ? <img src={b.logoUrl} alt={b.bankName} className="h-8 w-8 object-contain" /> : <Banknote className="h-6 w-6 text-muted-foreground" />}</TableCell>
                <TableCell className="font-medium">{b.bankName}</TableCell>
                <TableCell>{b.accountName}</TableCell>
                <TableCell><span className="font-mono text-xs" dir="ltr">{b.iban}</span></TableCell>
                <TableCell>{b.sortOrder}</TableCell>
                <TableCell><Badge variant={b.active ? "default" : "secondary"}>{b.active ? "نشط" : "موقوف"}</Badge></TableCell>
                <TableCell className="text-left">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
