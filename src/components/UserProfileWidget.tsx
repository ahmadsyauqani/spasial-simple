"use client";

import { useAuth } from "@/lib/AuthContext";
import { LogOut, User } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function UserProfileWidget() {
  const { profile } = useAuth();

  if (!profile) return null;

  return (
    <div className="absolute top-4 right-32 z-[9000] flex items-center gap-3 bg-card/85 backdrop-blur-xl border border-border/50 rounded-2xl p-1.5 shadow-xl transition-all hover:bg-card/95">
      <div className="flex flex-col items-end pl-3">
        <span className="text-xs font-bold text-foreground leading-none mb-1">{profile.full_name || "Pengguna SAKAGIS"}</span>
        <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{profile.organization || "User Aktif"}</span>
      </div>
      <div className="w-9 h-9 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shadow-inner">
        <User className="w-4 h-4" />
      </div>
      <div className="w-px h-6 bg-border/50 mx-0.5"></div>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          window.location.reload();
        }}
        title="Keluar (Logout)"
        className="w-9 h-9 flex items-center justify-center text-red-400/70 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
      >
        <LogOut className="w-4 h-4 ml-0.5" />
      </button>
    </div>
  );
}
