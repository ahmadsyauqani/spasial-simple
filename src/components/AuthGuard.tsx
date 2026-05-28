"use client";

import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import AuthPage from "./AuthPage";
import PendingApproval from "./PendingApproval";
import { Loader2 } from "lucide-react";

function GuestTimerBanner({ endTime }: { endTime: number | null }) {
  const [timeLeft, setTimeLeft] = useState<string>("--:--");

  useEffect(() => {
    if (!endTime) return;

    const interval = setInterval(() => {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00");
        clearInterval(interval);
      } else {
        const m = Math.floor(diff / 1000 / 60);
        const s = Math.floor((diff / 1000) % 60);
        setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);

    // Initial call
    const initialDiff = endTime - Date.now();
    if (initialDiff > 0) {
      const m = Math.floor(initialDiff / 1000 / 60);
      const s = Math.floor((initialDiff / 1000) % 60);
      setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }

    return () => clearInterval(interval);
  }, [endTime]);

  if (!endTime) return null;

  return (
    <div className="fixed top-6 right-6 z-[99999] pointer-events-none">
      <div className="bg-red-600/95 text-white backdrop-blur-md px-5 py-2.5 rounded-full shadow-2xl shadow-red-600/30 border border-red-500/50 flex items-center gap-3 font-bold text-sm tracking-wider">
        <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
        SISA WAKTU: <span className="font-mono text-base">{timeLeft}</span>
      </div>
    </div>
  );
}

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, profile, loading, isGuest, guestEndTime } = useAuth();

  if (isGuest) {
    return (
      <>
        {children}
        <GuestTimerBanner endTime={guestEndTime} />
      </>
    );
  }

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
