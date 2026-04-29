import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/use-auth";
import { CartProvider } from "@/hooks/use-cart";
import { CustomerAuthProvider } from "@/hooks/use-customer-auth";
import { StoreLayout } from "@/components/layout/store-layout";
import { AdminLayout } from "@/components/layout/admin-layout";

import Home from "@/pages/home";
import ProductDetail from "@/pages/product";
import Cart from "@/pages/cart";
import Checkout from "@/pages/checkout";
import CustomerLogin from "@/pages/login";
import MyOrders from "@/pages/my-orders";
import PaymentSuccess from "@/pages/payment-success";
import PaymentFailed from "@/pages/payment-failed";
import AdminLogin from "@/pages/admin/login";
import Dashboard from "@/pages/admin/dashboard";
import Products from "@/pages/admin/products";
import ProductForm from "@/pages/admin/product-form";
import Orders from "@/pages/admin/orders";
import OrderDetail from "@/pages/admin/order-detail";
import Customers from "@/pages/admin/customers";
import Bookings from "@/pages/admin/bookings";
import Whatsapp from "@/pages/admin/whatsapp";
import Settings from "@/pages/admin/settings";
import { useLocation } from "wouter";
import { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function ShellSwitcher({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isAdmin = location.startsWith("/admin") && location !== "/admin-login";
  const isAdminLogin = location === "/admin-login";

  if (isAdminLogin) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  if (isAdmin) {
    return (
      <AuthProvider>
        <AdminLayout>{children}</AdminLayout>
      </AuthProvider>
    );
  }

  return (
    <CustomerAuthProvider>
      <StoreLayout>{children}</StoreLayout>
    </CustomerAuthProvider>
  );
}

function Router() {
  return (
    <ShellSwitcher>
      <Switch>
        {/* Admin login */}
        <Route path="/admin-login" component={AdminLogin} />

        {/* Admin routes */}
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

        {/* Storefront routes */}
        <Route path="/" component={Home} />
        <Route path="/product/:id" component={ProductDetail} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/login" component={CustomerLogin} />
        <Route path="/my-orders" component={MyOrders} />
        <Route path="/payment/success" component={PaymentSuccess} />
        <Route path="/payment/failed" component={PaymentFailed} />

        <Route component={NotFound} />
      </Switch>
    </ShellSwitcher>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <Router />
          <Toaster />
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
