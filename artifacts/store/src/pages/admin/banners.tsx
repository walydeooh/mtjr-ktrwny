import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaPicker } from "@/components/ui/media-picker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Banner = {
  id: number;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  shape: "rectangle" | "square" | "circle";
  linkType: "url" | "product" | "category" | "none";
  linkUrl: string | null;
  linkProductId: number | null;
  linkCategoryId: number | null;
  sortOrder: number;
  active: boolean;
};
type Category = { id: number; name: string };
type Product = { id: number; name: string };

async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "خطأ");
  return r.json();
}

const SHAPE_LABEL = { rectangle: "مستطيل (16:9)", square: "مربع", circle: "دائري" } as const;
const SHAPE_CLASS = {
  rectangle: "aspect-[16/9]",
  square: "aspect-square",
  circle: "aspect-square rounded-full",
} as const;

export default function Banners() {
  const [list, setList] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    imageUrl: "",
    shape: "rectangle" as Banner["shape"],
    linkType: "none" as Banner["linkType"],
    linkUrl: "",
    linkProductId: "",
    linkCategoryId: "",
    sortOrder: "0",
    active: true,
  });

  async function load() {
    setLoading(true);
    try {
      const [bs, cs, ps] = await Promise.all([api("/banners"), api("/categories"), api("/products")]);
      setList(bs); setCategories(cs); setProducts(ps);
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ title: "", subtitle: "", imageUrl: "", shape: "rectangle", linkType: "none", linkUrl: "", linkProductId: "", linkCategoryId: "", sortOrder: "0", active: true });
    setOpen(true);
  }
  function openEdit(b: Banner) {
    setEditing(b);
    setForm({
      title: b.title || "",
      subtitle: b.subtitle || "",
      imageUrl: b.imageUrl,
      shape: b.shape,
      linkType: b.linkType,
      linkUrl: b.linkUrl || "",
      linkProductId: b.linkProductId ? String(b.linkProductId) : "",
      linkCategoryId: b.linkCategoryId ? String(b.linkCategoryId) : "",
      sortOrder: String(b.sortOrder),
      active: b.active,
    });
    setOpen(true);
  }

  async function save() {
    try {
      if (!form.imageUrl) { toast({ variant: "destructive", title: "صورة البانر مطلوبة" }); return; }
      const payload: Record<string, unknown> = {
        title: form.title || null,
        subtitle: form.subtitle || null,
        imageUrl: form.imageUrl,
        shape: form.shape,
        linkType: form.linkType,
        linkUrl: form.linkType === "url" ? (form.linkUrl || null) : null,
        linkProductId: form.linkType === "product" && form.linkProductId ? parseInt(form.linkProductId, 10) : null,
        linkCategoryId: form.linkType === "category" && form.linkCategoryId ? parseInt(form.linkCategoryId, 10) : null,
        sortOrder: parseInt(form.sortOrder || "0", 10),
        active: form.active,
      };
      if (editing) {
        await api(`/banners/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "تم التعديل" });
      } else {
        await api("/banners", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "تمت الإضافة" });
      }
      setOpen(false);
      void load();
    } catch (e) { toast({ variant: "destructive", title: "خطأ", description: (e as Error).message }); }
  }

  async function remove(id: number) {
    if (!confirm("حذف البانر؟")) return;
    await api(`/banners/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">البانرات الترويجية</h1>
          <p className="text-muted-foreground mt-1">أنشئ بانرات متعددة بأشكال وأهداف مختلفة على الصفحة الرئيسية</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" />بانر جديد</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "تعديل بانر" : "بانر جديد"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>صورة البانر *</Label><MediaPicker value={form.imageUrl} onChange={(v) => setForm({ ...form, imageUrl: v })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>العنوان</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>العنوان الفرعي</Label><Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>الشكل</Label>
                  <Select value={form.shape} onValueChange={(v) => setForm({ ...form, shape: v as Banner["shape"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SHAPE_LABEL) as Array<keyof typeof SHAPE_LABEL>).map((s) => (
                        <SelectItem key={s} value={s}>{SHAPE_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>ترتيب العرض</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
              </div>
              <div>
                <Label>عند النقر على البانر:</Label>
                <Select value={form.linkType} onValueChange={(v) => setForm({ ...form, linkType: v as Banner["linkType"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">لا يوجد رابط</SelectItem>
                    <SelectItem value="url">رابط مخصص</SelectItem>
                    <SelectItem value="product">منتج معيّن</SelectItem>
                    <SelectItem value="category">تصنيف معيّن</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.linkType === "url" && (
                <div><Label>الرابط</Label><Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/products أو https://..." dir="ltr" className="text-right" /></div>
              )}
              {form.linkType === "product" && (
                <div>
                  <Label>اختر المنتج</Label>
                  <Select value={form.linkProductId} onValueChange={(v) => setForm({ ...form, linkProductId: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر منتجاً" /></SelectTrigger>
                    <SelectContent>{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {form.linkType === "category" && (
                <div>
                  <Label>اختر التصنيف</Label>
                  <Select value={form.linkCategoryId} onValueChange={(v) => setForm({ ...form, linkCategoryId: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر تصنيفاً" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between"><Label>نشط</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>

              {form.imageUrl && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-2">معاينة:</div>
                  <div className={`overflow-hidden bg-muted ${SHAPE_CLASS[form.shape]} ${form.shape !== "circle" ? "rounded-lg" : ""}`}>
                    <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter><Button onClick={save}>{editing ? "حفظ" : "إضافة"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>المعاينة</TableHead><TableHead>العنوان</TableHead><TableHead>الشكل</TableHead>
            <TableHead>الهدف</TableHead><TableHead>الترتيب</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            : list.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-12">
                <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p>لا توجد بانرات بعد</p>
              </TableCell></TableRow>
            : list.map((b) => {
              const link = b.linkType === "none" ? "—"
                : b.linkType === "url" ? b.linkUrl
                : b.linkType === "product" ? `منتج #${b.linkProductId}`
                : `تصنيف #${b.linkCategoryId}`;
              return (
                <TableRow key={b.id}>
                  <TableCell><img src={b.imageUrl} alt="" className="h-12 w-20 rounded object-cover" /></TableCell>
                  <TableCell className="font-medium">{b.title || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{SHAPE_LABEL[b.shape]}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[160px] truncate">{link}</TableCell>
                  <TableCell>{b.sortOrder}</TableCell>
                  <TableCell><Badge variant={b.active ? "default" : "secondary"}>{b.active ? "نشط" : "موقوف"}</Badge></TableCell>
                  <TableCell className="text-left">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
