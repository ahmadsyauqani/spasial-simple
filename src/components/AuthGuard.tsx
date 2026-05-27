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
      <>
        {children}
        <div className="fixed inset-0 z-[9999] bg-transparent flex flex-col items-center justify-center gap-4 pointer-events-auto">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Memuat SAKAGIS...</span>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        {children}
        <div className="fixed inset-0 z-[9999] bg-transparent flex items-center justify-center pointer-events-auto">
          <AuthPage />
        </div>
      </>
    );
  }

  if (!profile || !profile.is_approved) {
    return (
      <>
        {children}
        <div className="fixed inset-0 z-[9999] bg-transparent flex items-center justify-center pointer-events-auto">
          <PendingApproval />
        </div>
      </>
    );
  }

  return <>{children}</>;
}
