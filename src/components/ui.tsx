"use client";
import { LoaderCircle, Search, ArrowUpRight, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { roles, stages } from "@/lib/constants";

export { roles, stages };
export type Row = Record<string, any>;
export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(path, { method: method || (body === undefined ? "GET" : "POST"), credentials: "same-origin", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const contentType = response.headers.get("content-type") || "";
  let data: any;
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server returned an invalid response (${response.status}). Please try again later.`);
    }
  } else {
    const text = await response.text();
    const isHtml = contentType.includes("text/html") || /^\s*(<!doctype html|<html)/i.test(text);
    data = { error: isHtml ? `Server error (${response.status}). Please try again later.` : text.slice(0, 500) };
  }
  if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
  return data;
}
export function Button({ children, className = "", variant = "primary", loading, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean }) {
  return <button {...props} disabled={props.disabled || loading} className={`btn btn-${variant} ${className}`}>{loading && <LoaderCircle size={16} className="spin" />}{children}</button>;
}
export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return <Link href="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="SAMADHAN home"><img src="/branding/samadhan-symbol.webp" alt="" width="42" height="42" /><span><strong>SAMADHAN</strong>{!compact && <small>LISTEN · ADDRESS · RESOLVE · EMPOWER</small>}</span></Link>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function StageBadge({ stage }: { stage: number }) { return <Badge tone={stage === 6 ? "green" : stage === 5 ? "amber" : "blue"}>{stages[Number(stage) - 1] || "Draft"}</Badge>; }
export function PriorityBadge({ value }: { value: string }) { return <Badge tone={/critical|emergency/i.test(value) ? "red" : /high/i.test(value) ? "amber" : "neutral"}>{value || "Normal"}</Badge>; }
export function PageTitle({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) { return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div><div className="page-actions">{actions}</div></div>; }
export function Panel({ title, subtitle, action, children, className = "" }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}>{title && <header className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}<div className="panel-body">{children}</div></section>; }
export function Loading({ text = "Synchronizing your workspaceâ€¦" }: { text?: string }) { return <div className="loading-state"><LoaderCircle className="spin" size={28} /><p>{text}</p><div className="skeleton-row" /><div className="skeleton-row short" /></div>; }
export function Empty({ title = "No records found", description = "Try changing your filters or check back after new activity.", action }: { title?: string; description?: string; action?: ReactNode }) { return <div className="empty"><Search size={32} /><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) { return <div className="error-state"><h3>We couldnâ€™t load this view</h3><p>{error instanceof Error ? error.message : "Please try again."}</p>{retry && <Button variant="secondary" onClick={retry}>Try again</Button>}</div>; }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const panel=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const selector='button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
    panel.current?.querySelector<HTMLElement>(selector)?.focus();
    const handle=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close.current();return;}
      if(event.key!=='Tab')return;
      const nodes=Array.from(panel.current?.querySelectorAll<HTMLElement>(selector)||[]).filter(node=>node.getClientRects().length>0);
      if(!nodes.length){event.preventDefault();return;}
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',handle);
    return()=>{document.removeEventListener('keydown',handle);if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="modal-backdrop" onClick={onClose}><section ref={panel} role="dialog" aria-modal="true" aria-label={title} className="modal" onClick={e => e.stopPropagation()}><header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></header>{children}</section></div>;
}
export function Disclaimer({ light = false }: { light?: boolean }) { return <div className={`disclaimer ${light ? "disclaimer-light" : ""}`}><ShieldCheck size={15} /><span>Independent demonstration Â· Synthetic data Â· No official AICTE affiliation</span></div>; }
export function NumberText({ value, suffix = "" }: { value: any; suffix?: string }) { return <>{Number.isFinite(Number(value)) && value !== null ? Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 }) : "â€”"}{suffix}</>; }
export function date(value?: string, time = false) { if (!value) return "â€”"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }); }
export function human(value: string) { return (value || "").replaceAll("_", " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()); }
export function Sla({ row }: { row: Row }) { const deadline = new Date(row.sla_due_at_utc || row.due_at_utc).getTime(); const delta = deadline - Date.now(); if (Number(row.current_stage) === 6) return <Badge tone={row.sla_breached ? "amber" : "green"}>{row.sla_breached ? "Closed after SLA" : "Closed within SLA"}</Badge>; if (!deadline) return <span>â€”</span>; const hours = Math.floor(Math.abs(delta) / 3600000); return <span className={`sla-text ${delta < 0 ? "text-red" : delta < 172800000 ? "text-amber" : "text-green"}`}><span className="status-dot" />{Math.floor(hours / 24)}d {hours % 24}h {delta < 0 ? "overdue" : "remaining"}</span>; }
export function TextLink({ href, children }: { href: string; children: ReactNode }) { return <Link className="text-link" href={href}>{children}<ArrowUpRight size={14} /></Link>; }
