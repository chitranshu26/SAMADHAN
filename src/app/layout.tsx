import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAMADHAN · Grievance Intelligence",
  description: "Smart AICTE Monitoring & Action Dashboard for Higher-ed Networks. Independent synthetic demonstration platform.",
  icons: { icon: "/branding/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><Providers>{children}</Providers></body></html>;
}
