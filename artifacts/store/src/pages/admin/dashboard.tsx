import { 
  useGetStatsOverview, 
  useGetSalesStats, 
  useGetTopProducts,
  getGetStatsOverviewQueryKey,
  getGetSalesStatsQueryKey,
  getGetTopProductsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Package, ShoppingCart, Users, DollarSign, ArrowUpRight } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from "recharts";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: stats } = useGetStatsOverview({
    query: { queryKey: getGetStatsOverviewQueryKey() }
  });

  const { data: salesStats } = useGetSalesStats(
    { period: "30d" },
    { query: { queryKey: getGetSalesStatsQueryKey({ period: "30d" }) } }
  );

  const { data: topProducts } = useGetTopProducts({
    query: { queryKey: getGetTopProductsQueryKey() }
  });

  if (!stats) return <div className="animate-pulse flex flex-col gap-6">
    <div className="h-8 bg-muted rounded w-48 mb-4"></div>
    <div className="grid md:grid-cols-4 gap-4"><div className="h-32 bg-muted rounded"></div><div className="h-32 bg-muted rounded"></div><div className="h-32 bg-muted rounded"></div><div className="h-32 bg-muted rounded"></div></div>
  </div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">نظرة عامة</h1>
        <p className="text-muted-foreground mt-2">إحصائيات متجرك وأداء المبيعات</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRevenue.toLocaleString('ar-SA')} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{stats.revenueToday.toLocaleString('ar-SA')} ر.س اليوم
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الطلبات</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{stats.ordersToday} طلب اليوم
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">العملاء</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المنتجات</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>المبيعات (آخر 30 يوم)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesStats || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value} `} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                    formatter={(value: number) => [`${value} ر.س`, 'الإيرادات']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>المنتجات الأكثر مبيعاً</CardTitle>
            <CardDescription>المنتجات ذات أعلى مبيعات في متجرك</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {topProducts?.map((product, i) => (
                <div key={product.id} className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {i + 1}
                  </div>
                  <div className="ml-4 rtl:mr-4 rtl:ml-0 space-y-1 flex-1">
                    <p className="text-sm font-medium leading-none line-clamp-1">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {product.totalSold} مباع
                    </p>
                  </div>
                  <div className="font-medium text-sm">
                    {product.revenue.toLocaleString('ar-SA')} ر.س
                  </div>
                </div>
              ))}
              
              {(!topProducts || topProducts.length === 0) && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  لا توجد مبيعات كافية لعرض هذه القائمة
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-6 border-t">
              <Button variant="outline" className="w-full" asChild>
                <Link href="/admin/products">
                  إدارة المنتجات
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
