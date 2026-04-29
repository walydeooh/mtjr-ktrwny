import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Category = {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
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

export default function Categories() {
  const [list, setList] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", slug: "", imageUrl: "", sortOrder: "0", active: true });

  async function load() {
    setLoading(true);
    try { setList(await api("/categories")); }
    catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: "", slug: "", imageUrl: "", sortOrder: "0", active: true });
    setOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, slug: c.slug, imageUrl: c.imageUrl || "", sortOrder: String(c.sortOrder), active: c.active });
    setOpen(true);
  }

  async function save() {
    try {
      const payload = {
        name: form.name,
        ...(form.slug ? { slug: form.slug } : {}),
        imageUrl: form.imageUrl || null,
        sortOrder: parseInt(form.sortOrder || "0", 10),
        active: form.active,
      };
      if (editing) {
        await api(`/categories/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "تم التعديل" });
      } else {
        await api("/categories", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "تمت الإضافة" });
      }
      setOpen(false);
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function remove(id: number) {
    if (!confirm("حذف التصنيف؟ سيتم فصله عن المنتجات المرتبطة به.")) return;
    await api(`/categories/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">التصنيفات</h1>
          <p className="text-muted-foreground mt-1">نظّم منتجاتك في تصنيفات وأظهرها على الصفحة الرئيسية</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" />تصنيف جديد</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل تصنيف" : "تصنيف جديد"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="إلكترونيات" /></div>
              <div><Label>المعرّف (Slug) — اختياري</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="electronics" dir="ltr" className="text-right" /></div>
              <div><Label>رابط صورة التصنيف</Label><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." dir="ltr" className="text-right" /></div>
              <div><Label>ترتيب العرض</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
              <div className="flex items-center justify-between"><Label>نشط</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>{editing ? "حفظ" : "إضافة"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الصورة</TableHead><TableHead>الاسم</TableHead><TableHead>المعرّف</TableHead>
            <TableHead>الترتيب</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            : list.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-12">
                <Tag className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا توجد تصنيفات بعد</p>
              </TableCell></TableRow>
            : list.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-muted" />}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><span className="font-mono text-xs">{c.slug}</span></TableCell>
                <TableCell>{c.sortOrder}</TableCell>
                <TableCell><Badge variant={c.active ? "default" : "secondary"}>{c.active ? "نشط" : "موقوف"}</Badge></TableCell>
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
