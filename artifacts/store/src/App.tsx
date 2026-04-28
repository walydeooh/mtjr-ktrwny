import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/use-auth";
import { CartProvider } from "@/hooks/use-cart";
import { StoreLayout } from "@/components/layout/store-layout";
import { AdminLayout } from "@/components/layout/admin-layout";

import Home from "@/pages/home";
import ProductDetail from "@/pages/product";
import Cart from "@/pages/cart";
import Checkout from "@/pages/checkout";
import Login from "@/pages/admin/login";
import Dashboard from "@/pages/admin/dashboard";
import Products from "@/pages/admin/products";
import ProductForm from "@/pages/admin/product-form";
import Orders from "@/pages/admin/orders";
import OrderDetail from "@/pages/admin/order-detail";
import Customers from "@/pages/admin/customers";
import Bookings from "@/pages/admin/bookings";
import Whatsapp from "@/pages/admin/whatsapp";
import Settings from "@/pages/admin/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function StoreRoutes() {
  return (
    <StoreLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/product/:id" component={ProductDetail} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route component={NotFound} />
      </Switch>
    </StoreLayout>
  );
}

function AdminRoutes() {
  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin" component={Dashboard} />
        <Route path="/admin/products" component={Products} />
        <Route path="/admin/products/new" component={ProductForm} />
        <Route path="/admin/products/:id/edit" component={ProductForm} />
        <Route path="/admin/orders" component={Orders} />
        <Route path="/admin/orders/:id" component={OrderDetail} />
        <Route path="/admin/customers" component={Customers} />
        <Route path="/admin/bookings" component={Bookings} />
        <Route path="/admin/whatsapp" component={Whatsapp} />
        <Route path="/admin/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/admin*" component={AdminRoutes} />
      <Route path="/*" component={StoreRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </CartProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
