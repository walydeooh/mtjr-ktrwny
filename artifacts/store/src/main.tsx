import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

setAuthTokenGetter(() => {
  const isAdminPath = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  if (isAdminPath) return localStorage.getItem("token");
  return localStorage.getItem("customer_token");
});

createRoot(document.getElementById("root")!).render(<App />);
