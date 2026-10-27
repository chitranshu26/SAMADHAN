"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { CheckCircle2, X, AlertCircle } from "lucide-react";

type Toast = { id: number; message: string; error?: boolean };
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10000, retry: 1, refetchOnWindowFocus: true } } }));
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => { if (localStorage.getItem("samadhan-theme") === "dark") document.documentElement.classList.add("dark"); }, []);
  const toast = (message: string, error = false) => {
    const id = Date.now(); setToasts(current => [...current.slice(-3), { id, message, error }]);
    setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 6000);
  };
  return <QueryClientProvider client={client}><ToastContext.Provider value={toast}>{children}<div className="toast-stack" role="status" aria-live="polite">{toasts.map(item => <div className={`toast ${item.error ? "toast-error" : ""}`} key={item.id}>{item.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}<span>{item.message}</span><button aria-label="Dismiss notification" onClick={() => setToasts(current => current.filter(t => t.id !== item.id))}><X size={16} /></button></div>)}</div></ToastContext.Provider></QueryClientProvider>;
}
