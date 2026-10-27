"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api, Badge, Button, Disclaimer, Logo, roles, Row } from "./ui";
import { useToast } from "./providers";

type Mode = "login" | "register" | "verify" | "forgot" | "reset" | "track";
const titles: Record<Mode, string> = { login: "Welcome back.", register: "Your voice matters.", verify: "Verify your email.", forgot: "Let’s get you back in.", reset: "A fresh start.", track: "Follow your case." };
const subtitles: Record<Mode, string> = { login: "Sign in to your connected grievance workspace.", register: "Create a secure complainant account to get started.", verify: "Confirm your email to activate your workspace.", forgot: "We’ll send a secure reset link to your email.", reset: "Choose a strong new password for your account.", track: "Enter your reference, then sign in securely to view updates." };

export function AuthScreen({ mode = "login" }: { mode?: Mode }) {
  const router = useRouter(); const params = useSearchParams(); const toast = useToast();
  const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const form = useForm<Row>({ defaultValues: { email: "", password: "", name: "", token: params.get("token") || "", ticket: "" } });
  const demo = useQuery({ queryKey: ["demo-accounts"], queryFn: () => api("/api/auth/demo"), enabled: mode === "login", retry: false });
  const accounts: Row[] = demo.data?.accounts || [];
  const selectAccount = (account: Row) => { form.setValue("email", account.email); form.setValue("password", account.password); setError(""); };
  useEffect(() => { const account = accounts.find(a => a.role === params.get("role")); if (account) selectAccount(account); }, [demo.data]);
  useEffect(() => { if (mode === "verify" && params.get("token")) { void submit({ token: params.get("token") }); } }, []);
  async function submit(values: Row) {
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "track") { router.push(`/login?next=${encodeURIComponent(`/complaints/${values.ticket}`)}`); return; }
      const endpoint = ({ login: "login", register: "register", verify: "verify", forgot: "forgot", reset: "reset" } as const)[mode];
      const response = await api(`/api/auth/${endpoint}`, values);
      if (mode === "login") { toast("Signed in securely"); router.push(params.get("next")?.startsWith("/") && !params.get("next")?.startsWith("//") ? params.get("next")! : "/dashboard"); router.refresh(); }
      else if (mode === "register") setMessage(response.message || "Account created. Check your email for a verification link. In local mode, your administrator can open the simulated mail outbox.");
      else if (mode === "verify") setMessage(response.message || "Your email is verified. You can now sign in.");
      else if (mode === "forgot") setMessage("If an active account exists, a password reset link has been queued. In local mode, check the simulated mail outbox.");
      else setMessage(response.message || "Password updated. You can now sign in securely.");
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); } finally { setBusy(false); }
  }
  return <div className="auth-page"><aside className="auth-aside"><Logo light /><div className="auth-aside-art"><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-orbit orbit-three" /><div className="auth-shield"><ShieldCheck size={74} strokeWidth={1} /></div><span className="orbit-node node-one"><Mail size={22} /></span><span className="orbit-node node-two"><Check size={22} /></span><span className="orbit-node node-three"><Sparkles size={22} /></span></div><div className="auth-pitch"><span className="eyebrow">ONE PLATFORM. SHARED ACCOUNTABILITY.</span><h2>Intelligence that connects.<br />Resolution that matters.</h2><p>A secure workspace for every stage of the grievance journey—from the first concern to the final decision.</p><div className="auth-pitch-features"><span><Check size={15} /> Six connected role experiences</span><span><Check size={15} /> Transparent, auditable workflows</span><span><Check size={15} /> AI-assisted duplicate intelligence</span></div></div><Disclaimer light /></aside><main className="auth-main"><Link href="/" className="auth-back"><ArrowLeft size={16} />Back to home</Link><div className="auth-form-wrap"><Badge tone="blue"><LockKeyhole size={12} /> SECURE WORKSPACE</Badge><h1>{titles[mode]}</h1><p>{subtitles[mode]}</p>{mode === "login" && accounts.length > 0 && <div className="demo-select"><label htmlFor="demo-role">Explore a demonstration role</label><select id="demo-role" defaultValue="" onChange={e => { const a = accounts.find(a => a.email === e.target.value); if (a) selectAccount(a); }}><option value="" disabled>Select one of six demo accounts</option>{accounts.map(account => <option key={account.email} value={account.email}>{roles[account.role]} · {account.name}</option>)}</select><small>Local demo credentials are generated securely during setup.</small></div>}
    {message ? <div className="success-box"><ShieldCheck size={25} /><h3>{mode === "verify" ? "Verification complete" : "Request received"}</h3><p>{message}</p><Link className="btn btn-primary" href="/login">Continue to sign in <ArrowRight size={16} /></Link></div> : <form className="auth-form" onSubmit={form.handleSubmit(submit)}>
    {mode === "register" && <label>Full name<input autoComplete="name" placeholder="Your full name" {...form.register("name", { required: true, minLength: 2 })} required minLength={2} maxLength={100} /></label>}
    {["login", "register", "forgot"].includes(mode) && <label>Email address<div className="input-icon"><Mail size={17} /><input type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email", { required: true })} required /></div></label>}
    {["login", "register", "reset"].includes(mode) && <label>{mode === "reset" ? "New password" : "Password"}<div className="input-icon"><LockKeyhole size={17} /><input type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Enter your password" : "At least 12 characters"} minLength={mode === "login" ? 1 : 12} maxLength={128} {...form.register("password", { required: true })} required /><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
    {["verify", "reset"].includes(mode) && <label>Secure token<input {...form.register("token", { required: true })} required placeholder="Paste the token from your email link" /></label>}
    {mode === "track" && <label>Complaint reference<input {...form.register("ticket", { required: true })} required placeholder="SAM-2026-000001 or CASE-00000001" /></label>}
    {mode === "login" && <div className="auth-options"><span><ShieldCheck size={13} /> Protected session</span><Link href="/forgot-password">Forgot password?</Link></div>}
    {mode === "register" && <label className="checkbox-label"><input type="checkbox" required />I understand this is an independent demonstration and will use synthetic information.</label>}
    {error && <div className="inline-error" role="alert">{error}</div>}<Button loading={busy} type="submit" className="full-width">{{ login: "Sign in to workspace", register: "Create your account", verify: "Verify email", forgot: "Send reset link", reset: "Update password", track: "Continue securely" }[mode]}<ArrowRight size={17} /></Button></form>}
    <div className="auth-switch">{mode === "login" ? <>New to SAMADHAN? <Link href="/register">Create an account</Link></> : <>Already have an account? <Link href="/login">Sign in</Link></>}</div><div className="auth-security"><ShieldCheck size={16} /><span>Your information is accessible only to authorized accounts.<br />No government identity verification is performed in this demo.</span></div></div><p className="auth-bottom">SAMADHAN · Independent synthetic demonstration</p></main></div>;
}
