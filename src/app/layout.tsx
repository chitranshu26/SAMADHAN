import type { Metadata } from "next";
import { BrandIntro } from "@/components/brand-intro";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./theme-light.css";
import "./government.css";
import "./portal-polish.css";
import "./digital-experience.css";

export const metadata: Metadata = {
  title: "SAMADHAN · Grievance Intelligence",
  description: "Smart AICTE Monitoring & Action Dashboard for Higher-ed Networks. Independent synthetic demonstration platform.",
  icons: { icon: [{ url: "/branding/favicon.ico" }, { url: "/branding/favicon-32x32.png", sizes: "32x32", type: "image/png" }, { url: "/branding/favicon-16x16.png", sizes: "16x16", type: "image/png" }], apple: "/branding/apple-touch-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><BrandIntro /><Providers>{children}</Providers></body></html>;
}
