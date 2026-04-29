import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Send, Megaphone, Upload, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Campaign = {
  id: number;
  name: string;
  message: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  delayMinSeconds?: number;
  delayMaxSeconds?: number;
  recipientPhones?: string | null;
};
type Customer = { id: number; name: string; phone: string };

async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "secondary" },
  sending: { label: "جاري الإرسال", variant: "outline" },
  sent: { label: "تم الإرسال", variant: "default" },
};

export default function Campaigns() {
  const [list, setList] = useState<Campaign[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    message: "",
    delayMin: 5,
    delayMax: 50,
    target: "all" as "all" | "selected" | "manual",
    selected: [] as string[],
    manualPhones: "",
  });

  async function load() {
    setLoading(true);
    try { setList(await api("/campaigns")); }
    catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    api("/customers").then(setCustomers).catch(() => {});
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, []);

  function buildRecipientPhones(): string | null {
    if (form.target === "all") return null;
    if (form.target === "selected") return form.selected.join("\n") || null;
    return form.manualPhones.trim() || null;
  }

  async function save() {
    try {
      await api("/campaigns", { method: "POST", body: JSON.stringify({
        name: form.name,
        message: form.message,
        delayMinSeconds: form.delayMin,
        delayMaxSeconds: form.delayMax,
        recipientPhones: buildRecipientPhones(),
      })});
      toast({ title: "تم إنشاء الحملة" });
      setOpen(false);
      setForm({ name: "", message: "", delayMin: 5, delayMax: 50, target: "all", selected: [], manualPhones: "" });
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function send(id: number) {
    if (!confirm("سيتم إرسال هذه الحملة الآن. هل أنت متأكد؟")) return;
    try {
      const r = await api(`/campaigns/${id}/send`, { method: "POST" });
      toast({ title: "بدأ الإرسال", description: `سيتم الإرسال لـ ${r.queued} مستلم` });
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function remove(id: number) {
    if (!confirm("حذف الحملة؟")) return;
    await api(`/campaigns/${id}`, { method: "DELETE" });
    void load();
  }

  function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const phones = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
      setForm((f) => ({ ...f, target: "manual", manualPhones: phones.join("\n") }));
      toast({ title: `تم استيراد ${phones.length} رقم` });
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleSelected(phone: string) {
    setForm((f) => ({ ...f, selected: f.selected.includes(phone) ? f.selected.filter((p) => p !== phone) : [...f.selected, phone] }));
  }
  function selectAll() {
    setForm((f) => ({ ...f, selected: customers.map((c) => c.phone) }));
  }
  function clearSelected() { setForm((f) => ({ ...f, selected: [] })); }

  const recipientCount = form.target === "all" ? customers.length
    : form.target === "selected" ? form.selected.length
    : form.manualPhones.split(/[\n,;]+/).filter((s) => s.trim()).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">الحملات التسويقية</h1>
          <p className="text-muted-foreground mt-1">إرسال رسائل واتساب جماعية مع تأخير عشوائي شبيه بالإنسان</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-2" />حملة جديدة</Button></DialogTrigger>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>حملة تسويقية جديدة</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>اسم الحملة</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="عرض رمضان" /></div>
              <div><Label>نص الرسالة</Label><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="مرحباً! لدينا عرض خاص لك..." /></div>

              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <Label className="font-bold">التأخير العشوائي بين الرسائل (ثواني)</Label>
                <p className="text-xs text-muted-foreground">يحاكي السلوك البشري لتجنب الحظر. النطاق: 1-600 ثانية.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">الحد الأدنى: {form.delayMin} ث</Label>
                    <input type="range" min="1" max="120" value={form.delayMin} onChange={(e) => setForm({ ...form, delayMin: parseInt(e.target.value) })} className="w-full mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">الحد الأقصى: {form.delayMax} ث</Label>
                    <input type="range" min="1" max="600" value={form.delayMax} onChange={(e) => setForm({ ...form, delayMax: parseInt(e.target.value) })} className="w-full mt-1" />
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-bold">المستلمون ({recipientCount})</Label>
                  <input ref={fileRef} type="file" accept=".csv,.txt" onChange={importCsv} className="hidden" />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-4 h-4 ml-1" /> استيراد ملف
                  </Button>
                </div>
                <div className="flex gap-2 text-sm">
                  <button type="button" className={`flex-1 p-2 rounded border ${form.target === "all" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setForm({ ...form, target: "all" })}>
                    <Users className="w-4 h-4 inline ml-1" /> جميع العملاء ({customers.length})
                  </button>
                  <button type="button" className={`flex-1 p-2 rounded border ${form.target === "selected" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setForm({ ...form, target: "selected" })}>
                    اختيار من القائمة
                  </button>
                  <button type="button" className={`flex-1 p-2 rounded border ${form.target === "manual" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setForm({ ...form, target: "manual" })}>
                    إدخال يدوي
                  </button>
                </div>
                {form.target === "selected" && (
                  <div>
                    <div className="flex justify-end gap-2 mb-2 text-xs">
                      <button type="button" className="text-primary hover:underline" onClick={selectAll}>تحديد الكل</button>
                      <button type="button" className="text-muted-foreground hover:underline" onClick={clearSelected}>مسح</button>
                    </div>
                    <div className="border rounded max-h-44 overflow-y-auto p-2 space-y-1">
                      {customers.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 p-1 hover:bg-muted rounded cursor-pointer text-sm">
                          <input type="checkbox" checked={form.selected.includes(c.phone)} onChange={() => toggleSelected(c.phone)} />
                          <span className="flex-1">{c.name}</span>
                          <span className="text-xs text-muted-foreground" dir="ltr">{c.phone}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {form.target === "manual" && (
                  <Textarea rows={5} value={form.manualPhones} onChange={(e) => setForm({ ...form, manualPhones: e.target.value })} placeholder="أرقام الجوال (سطر لكل رقم، أو مفصولة بفاصلة)" dir="ltr" className="text-right font-mono text-xs" />
                )}
              </div>
            </div>
            <DialogFooter><Button onClick={save} disabled={!form.name || !form.message}>حفظ كمسودة</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الاسم</TableHead><TableHead>الرسالة</TableHead><TableHead>الحالة</TableHead>
            <TableHead>التقدم</TableHead><TableHead>التأخير</TableHead><TableHead>التاريخ</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            : list.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-12">
                <Megaphone className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا توجد حملات بعد</p>
              </TableCell></TableRow>
            : list.map((c) => {
              const s = statusLabels[c.status] || { label: c.status, variant: "secondary" as const };
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{c.message}</TableCell>
                  <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                  <TableCell>{c.totalRecipients > 0 ? `${c.sentCount}/${c.totalRecipients}` + (c.failedCount > 0 ? ` (فشل: ${c.failedCount})` : "") : "—"}</TableCell>
                  <TableCell className="text-xs">{c.delayMinSeconds ?? 5}-{c.delayMaxSeconds ?? 50} ث</TableCell>
                  <TableCell>{new Date(c.createdAt).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell className="text-left">
                    {c.status === "draft" && (
                      <Button variant="ghost" size="icon" onClick={() => send(c.id)} title="إرسال الآن"><Send className="h-4 w-4 text-primary" /></Button>
                    )}
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
