"use client";

import { ReactNode } from "react";
import { useAuth } from "@/lib/AuthContext";
import AuthPage from "./AuthPage";
import PendingApproval from "./PendingApproval";
import { Loader2 } from "lucide-react";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Memuat SAKAGIS...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!profile || !profile.is_approved) {
    return <PendingApproval />;
  }

  return <>{children}</>;
}
