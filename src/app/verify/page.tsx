import { Suspense } from "react";
import { AuthScreen } from "@/components/auth";
export default function Page() { return <Suspense><AuthScreen mode="verify" /></Suspense>; }
