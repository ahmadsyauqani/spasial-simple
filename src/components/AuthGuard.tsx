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
        <div className="pointer-events-none select-none blur-sm opacity-50 transition-all duration-500 w-full h-full">
          {children}
        </div>
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Memuat SAKAGIS...</span>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <div className="pointer-events-none select-none blur-md opacity-30 transition-all duration-500 w-full h-full">
          {children}
        </div>
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <AuthPage />
        </div>
      </>
    );
  }

  if (!profile || !profile.is_approved) {
    return (
      <>
        <div className="pointer-events-none select-none blur-md opacity-30 transition-all duration-500 w-full h-full">
          {children}
        </div>
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <PendingApproval />
        </div>
      </>
    );
  }

  return <>{children}</>;
}
