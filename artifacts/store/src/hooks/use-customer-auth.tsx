import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Customer, getGetCustomerMeQueryKey } from "@workspace/api-client-react";

interface CustomerAuthContextType {
  customer: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setSession: (token: string, customer: Customer) => void;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

const TOKEN_KEY = "customer_token";
const CUSTOMER_KEY = "customer_data";

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState<Customer | null>(() => {
    try {
      const raw = localStorage.getItem(CUSTOMER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [isLoading] = useState(false);

  const setSession = useCallback((token: string, c: Customer) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
    setCustomer(c);
    queryClient.invalidateQueries({ queryKey: getGetCustomerMeQueryKey() });
  }, [queryClient]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
    setCustomer(null);
    queryClient.clear();
  }, [queryClient]);

  // Validate token on mount in background (silent)
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !customer) return;
    fetch("/api/customer-auth/me", { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((c: Customer) => {
        localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
        setCustomer(c);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(CUSTOMER_KEY);
        setCustomer(null);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        isLoading,
        isAuthenticated: !!customer,
        setSession,
        logout,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be inside CustomerAuthProvider");
  return ctx;
}
