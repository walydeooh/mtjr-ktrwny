import { useState } from "react";
import { useListCustomers, getListCustomersQueryKey } from "@workspace/api-client-react";
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
import { Input } from "@/components/ui/input";
import { Search, Users, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Customers() {
  const [search, setSearch] = useState("");

  const { data: customers, isLoading } = useListCustomers(
    { search: search || undefined },
    { query: { queryKey: getListCustomersQueryKey({ search: search || undefined }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">العملاء</h1>
          <p className="text-muted-foreground mt-1">سجل عملاء متجرك وإحصائياتهم</p>
        </div>
      </div>

      <div className="bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم أو رقم الجوال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3 pr-10"
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>العميل</TableHead>
              <TableHead>معلومات الاتصال</TableHead>
              <TableHead>إجمالي الطلبات</TableHead>
              <TableHead>إجمالي المدفوعات</TableHead>
              <TableHead>تاريخ الانضمام</TableHead>
              <TableHead className="text-left"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="animate-pulse flex flex-col items-center justify-center space-y-4">
                    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                    <div className="text-muted-foreground">جاري تحميل العملاء...</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : customers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium">لا يوجد عملاء</p>
                  <p className="text-muted-foreground text-sm mt-1">لم يتم العثور على عملاء تطابق بحثك</p>
                </TableCell>
              </TableRow>
            ) : (
              customers?.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {customer.name.charAt(0)}
                      </div>
                      {customer.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div dir="ltr" className="text-right inline-block">{customer.phone}</div>
                    {customer.email && <div className="text-xs text-muted-foreground">{customer.email}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{customer.totalOrders} طلب</Badge>
                  </TableCell>
                  <TableCell className="font-bold text-primary">
                    {customer.totalSpent.toLocaleString('ar-SA')} ر.س
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(customer.createdAt), "yyyy/MM/dd", { locale: arSA })}
                  </TableCell>
                  <TableCell className="text-left">
                    <Button variant="ghost" size="sm" asChild className="text-xs">
                      <Link href={`/admin/orders?customerId=${customer.id}`}>
                        عرض الطلبات
                        <ExternalLink className="w-3 h-3 mr-1" />
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
