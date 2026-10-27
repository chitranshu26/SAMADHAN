"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bell, BookOpen, Building2, ChevronDown, ChevronRight, CircleHelp, Command, FilePlus2, FolderOpen, Globe2, LayoutDashboard, LogOut, Menu, Moon, Search, Settings2, Shield, Sparkles, Sun, UserRound, X } from "lucide-react";
import { api, Badge, Button, Disclaimer, ErrorState, Loading, Logo, roles, Row } from "./ui";
import { useToast } from "./providers";
import { Dashboard } from "./dashboard";
import { ComplaintList, ComplaintWizard } from "./complaints";
import { CaseWorkspace } from "./case-workspace";
import { Intelligence, Institutions, Notifications, Profile, Replay } from "./operations";
import { Admin } from "./admin";

export function Workspace() {
  const path = usePathname(); const router = useRouter(); const toast = useToast(); const [mobile, setMobile] = useState(false); const [dark, setDark] = useState(false); const [search, setSearch] = useState("");
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: () => api("/api/bootstrap"), retry: false });
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => api("/api/notifications"), enabled: !!bootstrap.data?.user, refetchInterval: 12000 });
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  useEffect(() => { if (bootstrap.error && /unauthorized|authentication|sign in|session|401/i.test(String(bootstrap.error))) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [bootstrap.error, path, router]);
  useEffect(() => { setMobile(false); }, [path]);
  const user = bootstrap.data?.user;
  if (bootstrap.isPending) return <div className="workspace-loading"><Logo /><Loading text="Preparing your secure workspace…" /></div>;
  if (!user) return <div className="workspace-loading"><Logo /><ErrorState error={bootstrap.error || "Please sign in to continue."} retry={() => router.push("/login")} /></div>;
  const role = user.role; const admin = role === "admin"; const complainant = role === "complainant";
  const nav = [
    { href: "/dashboard", title: "Overview", icon: LayoutDashboard },
    ...(!admin ? [{ href: "/complaints", title: complainant ? "My complaints" : "Complaint registry", icon: FolderOpen }] : []),
    ...(complainant ? [{ href: "/complaints/new", title: "File a complaint", icon: FilePlus2 }] : []),
    ...(!complainant && !admin ? [{ href: "/intelligence", title: "AI intelligence", icon: Sparkles }, { href: "/analytics", title: "Analytics & reports", icon: Globe2 }, { href: "/institutions", title: "Institutions", icon: Building2 }] : []),
    ...(admin ? [{ href: "/admin", title: "Administration", icon: Settings2 }] : []),
    { href: "/notifications", title: "Notifications", icon: Bell },
    ...(!complainant && role !== "da" ? [{ href: "/replay", title: "Historical replay", icon: Activity }] : []),
  ];
  const title = nav.find(item => path.startsWith(item.href) && item.href !== "/dashboard")?.title || "Overview";
  const toggleTheme = () => { const next = !dark; setDark(next); document.documentElement.classList.toggle("dark", next); localStorage.setItem("samadhan-theme", next ? "dark" : "light"); };
  const logout = async () => { try { await api("/api/auth/logout", {}); router.push("/login"); router.refresh(); } catch (err) { toast(String(err), true); } };
  const unread = notifications.data?.unread ?? notifications.data?.unread_count ?? (notifications.data?.rows || []).filter((n: Row) => !n.read_at && !n.is_read).length;
  let content;
  if (path === "/dashboard") content = admin ? <Admin bootstrap={bootstrap.data} /> : <Dashboard bootstrap={bootstrap.data} />;
  else if (path === "/analytics") content = <Dashboard bootstrap={bootstrap.data} full />;
  else if (path === "/complaints/new") content = <ComplaintWizard bootstrap={bootstrap.data} />;
  else if (path === "/complaints") content = <ComplaintList bootstrap={bootstrap.data} />;
  else if (path.startsWith("/complaints/")) content = <CaseWorkspace id={decodeURIComponent(path.split("/")[2])} bootstrap={bootstrap.data} />;
  else if (path === "/intelligence") content = <Intelligence bootstrap={bootstrap.data} />;
  else if (path === "/institutions") content = <Institutions bootstrap={bootstrap.data} />;
  else if (path === "/notifications") content = <Notifications />;
  else if (path === "/admin") content = <Admin bootstrap={bootstrap.data} />;
  else if (path === "/profile") content = <Profile user={user} />;
  else if (path === "/replay") content = <Replay bootstrap={bootstrap.data} />;
  else content = <ErrorState error="This workspace page could not be found." retry={() => router.push("/dashboard")} />;
  return <div className="workspace">{mobile && <div className="mobile-scrim" onClick={() => setMobile(false)} />}<aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}><div className="sidebar-brand"><Logo light /><button className="mobile-only icon-btn" onClick={() => setMobile(false)} aria-label="Close navigation"><X size={20} /></button></div><div className="workspace-switch"><div className="workspace-switch-icon"><Shield size={18} /></div><div><strong>{complainant ? "Citizen workspace" : admin ? "System operations" : "Operations workspace"}</strong><span>{roles[role]}</span></div><ChevronDown size={14} /></div><div className="nav-label">WORKSPACE</div><nav className="sidebar-nav">{nav.map(item => <Link key={item.href} href={item.href} className={(path === item.href || (item.href === "/complaints" && path.startsWith("/complaints/") && path !== "/complaints/new")) ? "active" : ""}><item.icon size={19} /><span>{item.title}</span>{item.href === "/notifications" && unread > 0 && <b>{unread}</b>}</Link>)}</nav><div className="sidebar-bottom"><div className="demo-note"><Sparkles size={18} /><strong>Demonstration workspace</strong><p>Connected to synthetic records. Actions persist in the demo database.</p><span><span className="status-dot" /> Polling connected · 12s</span></div><Link className="sidebar-help" href="/#help"><CircleHelp size={18} />Help & documentation<ArrowIcon /></Link><button className="sidebar-user" onClick={() => router.push("/profile")}><span className="avatar">{user.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}</span><span><strong>{user.name}</strong><small>{roles[role]}</small></span><ChevronRight size={15} /></button></div></aside><div className="workspace-main"><header className="workspace-header"><div className="header-location"><button className="icon-btn mobile-only" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu size={21} /></button><span className="breadcrumb-root">Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="header-tools">{!admin && <form className="global-search" onSubmit={e => { e.preventDefault(); router.push(`/complaints?q=${encodeURIComponent(search)}`); }}><Search size={16} /><input aria-label="Search complaints" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cases, institutions…" /><span>↵</span></form>}<Badge tone="amber">DEMO MODE</Badge><button onClick={toggleTheme} className="icon-btn" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><Link href="/notifications" className="icon-btn notification-bell" aria-label={`Notifications, ${unread} unread`}><Bell size={20} />{unread > 0 && <i />}</Link><button className="icon-btn" onClick={logout} aria-label="Sign out"><LogOut size={19} /></button></div></header><div className="demo-banner"><Shield size={14} /><span>Independent synthetic demonstration. Regional mappings and SLA deadlines are project configurations.</span><span className="banner-scope">{user.bureau_id ? `${user.bureau_id} scope` : role === "chairman" ? "National aggregate view" : "Authorized workspace"}</span></div><main className="workspace-content" key={path}>{content}</main><footer className="workspace-footer"><Disclaimer /><span>All timestamps shown in IST · Secure, auditable operations</span></footer></div></div>;
}
function ArrowIcon() { return <ChevronRight size={14} />; }
