import { useState } from "react";
import { Link } from "wouter";
import { useListOrders, getListOrdersQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Eye, ShoppingCart } from "lucide-react";

export function OrderStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string, variant: string, colorClass: string }> = {
    pending: { label: "جديد", variant: "default", colorClass: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
    payment_pending: { label: "بانتظار الدفع", variant: "outline", colorClass: "bg-orange-500/10 text-orange-700 border-orange-500/20" },
    paid: { label: "تم الدفع", variant: "default", colorClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
    processing: { label: "جاري التجهيز", variant: "default", colorClass: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
    shipped: { label: "تم الشحن", variant: "default", colorClass: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20" },
    delivered: { label: "مكتمل", variant: "default", colorClass: "bg-green-500/10 text-green-700 border-green-500/20" },
    cancelled: { label: "ملغي", variant: "secondary", colorClass: "bg-red-500/10 text-red-700 border-red-500/20" },
  };

  const config = statusConfig[status] || { label: status, variant: "outline", colorClass: "" };

  return (
    <Badge variant={config.variant as any} className={`font-medium ${config.colorClass}`}>
      {config.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string, colorClass: string }> = {
    unpaid: { label: "غير مدفوع", colorClass: "bg-red-100 text-red-800" },
    pending: { label: "معلق", colorClass: "bg-orange-100 text-orange-800" },
    paid: { label: "مدفوع", colorClass: "bg-emerald-100 text-emerald-800" },
    failed: { label: "فشل", colorClass: "bg-red-100 text-red-800" },
  };

  const config = statusConfig[status] || { label: status, colorClass: "" };

  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${config.colorClass}`}>
      {config.label}
    </span>
  );
}

export default function Orders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders, isLoading } = useListOrders(
    { status: statusFilter !== "all" ? statusFilter : undefined },
    { query: { queryKey: getListOrdersQueryKey({ status: statusFilter !== "all" ? statusFilter : undefined }) } }
  );

  const filteredOrders = orders?.filter((o) => 
    o.id.toString().includes(search) || 
    o.customerName.toLowerCase().includes(search.toLowerCase()) ||
    o.customerPhone.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الطلبات</h1>
          <p className="text-muted-foreground mt-1">متابعة وإدارة طلبات العملاء</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث برقم الطلب، اسم العميل، جوال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3 pr-10"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="تصفية حسب الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="pending">جديد</SelectItem>
              <SelectItem value="payment_pending">بانتظار الدفع</SelectItem>
              <SelectItem value="paid">تم الدفع</SelectItem>
              <SelectItem value="processing">جاري التجهيز</SelectItem>
              <SelectItem value="shipped">تم الشحن</SelectItem>
              <SelectItem value="delivered">مكتمل</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم الطلب</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>المجموع</TableHead>
              <TableHead>حالة الطلب</TableHead>
              <TableHead>الدفع</TableHead>
              <TableHead className="text-left">عرض</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="animate-pulse flex flex-col items-center justify-center space-y-4">
                    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                    <div className="text-muted-foreground">جاري تحميل الطلبات...</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredOrders?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium">لا توجد طلبات</p>
                  <p className="text-muted-foreground text-sm mt-1">لم يتم العثور على طلبات تطابق بحثك</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium text-primary">#{order.id}</TableCell>
                  <TableCell>
                    {format(new Date(order.createdAt), "yyyy/MM/dd p", { locale: arSA })}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{order.customerName}</div>
                    <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                  </TableCell>
                  <TableCell className="font-bold">{order.totalAmount.toLocaleString('ar-SA')} ر.س</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </TableCell>
                  <TableCell className="text-left">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/admin/orders/${order.id}`}>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">عرض التفاصيل</span>
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
