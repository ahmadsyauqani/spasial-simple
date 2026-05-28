"use client";

import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import AuthPage from "./AuthPage";
import PendingApproval from "./PendingApproval";
import { Loader2, Crown, CheckCircle2, XCircle, X } from "lucide-react";

function GuestTimerBanner({ endTime }: { endTime: number | null }) {
  const [timeLeft, setTimeLeft] = useState<string>("--:--");
  const [showModal, setShowModal] = useState(false);
  const { logoutGuest } = useAuth();

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
    <>
      <div className="fixed top-[80px] left-1/2 -translate-x-1/2 z-[99998]">
        <button 
          onClick={() => setShowModal(true)}
          className="bg-red-600/95 hover:bg-red-500 text-white backdrop-blur-md px-5 py-2.5 rounded-full shadow-2xl shadow-red-600/30 border border-red-500/50 flex items-center gap-3 font-bold text-sm tracking-wider transition-all hover:scale-105 active:scale-95 group cursor-pointer pointer-events-auto"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)] group-hover:bg-yellow-300" />
          SISA WAKTU: <span className="font-mono text-base">{timeLeft}</span>
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto animate-in fade-in duration-200">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 relative flex flex-col max-h-[90vh]">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 text-center bg-gradient-to-br from-indigo-500/20 via-transparent to-purple-500/10 border-b border-white/5 shrink-0">
              <div className="w-16 h-16 bg-gradient-to-tr from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(234,179,8,0.3)] rotate-3">
                <Crown className="w-8 h-8 text-white -rotate-3" />
              </div>
              <h2 className="text-3xl font-black text-white mb-2">Tingkatkan ke SAKAGIS Pro</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">Anda sedang menggunakan mode Guest dengan keterbatasan waktu. Buka semua fitur unggulan tanpa batas sekarang juga!</p>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="p-4 font-bold text-gray-400 w-1/3">Fitur</th>
                      <th className="p-4 font-bold text-white text-center w-1/3">Guest (Gratis)</th>
                      <th className="p-4 font-black text-yellow-400 text-center w-1/3 bg-yellow-500/5">PRO (Premium)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      { feature: "Batas Waktu Penggunaan", guest: "5 Menit / Sesi", pro: "Sepuasnya (Unlimited)" },
                      { feature: "Penyimpanan Data", guest: "Lokal (Hilang saat keluar)", pro: "Cloud Database (Permanen)" },
                      { feature: "Modifikasi Server", guest: "Sandbox (Read-only)", pro: "Full Control (Read/Write/Delete)" },
                      { feature: "Tools Analisis", guest: "Terbatas", pro: "Full Access & Advance Tools" },
                      { feature: "Export Data", guest: "Hanya GeoJSON", pro: "Semua Format (SHP, KML, CSV)" },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="p-4 font-medium text-gray-300">{row.feature}</td>
                        <td className="p-4 text-center text-gray-400">
                          {row.guest.includes("Sepuasnya") || row.guest.includes("Full") ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" /> : <XCircle className="w-4 h-4 text-red-500/50 mx-auto mb-1" />}
                          <span className="text-[11px] block">{row.guest}</span>
                        </td>
                        <td className="p-4 text-center bg-yellow-500/5">
                          <CheckCircle2 className="w-5 h-5 text-yellow-400 mx-auto mb-1 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
                          <span className="text-[11px] font-bold text-yellow-200 block">{row.pro}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 bg-black/40 border-t border-white/5 flex gap-4 shrink-0">
              <button 
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-400 hover:bg-white/5 transition-colors"
              >
                Lanjutkan Guest
              </button>
              <button 
                onClick={() => {
                  setShowModal(false);
                  localStorage.setItem("defaultAuthTab", "register");
                  logoutGuest();
                }}
                className="flex-[2] py-3 px-4 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-white font-black rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Crown className="w-5 h-5" />
                Daftar PRO Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
