"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";

export function UserProfileWidget() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!profile) return null;

  const name = profile.full_name || "Pengguna SAKAGIS";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S";

  return (
    <div ref={rootRef} className="absolute top-4 right-4 z-[9000]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-2 rounded-2xl border border-white/15 bg-card/75 px-2 backdrop-blur-xl shadow-xl transition-all hover:border-orange-500/40 hover:bg-card/95"
        title="Buka profil pengguna"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-orange-500/35 bg-orange-500/15 text-[11px] font-black text-orange-300">
          {initials}
        </span>
        <span className="hidden max-w-[130px] text-left sm:block">
          <strong className="block truncate text-[11px] font-bold text-foreground">{name}</strong>
          <small className="block truncate text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{profile.organization || "User aktif"}</small>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-2xl border border-white/15 bg-card/95 p-2 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-orange-300" />
              <div className="min-w-0">
                <strong className="block truncate text-xs text-foreground">{name}</strong>
                <span className="block truncate text-[10px] text-muted-foreground">{user?.email || "Akun Supabase"}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> Online
            </div>
          </div>
          <div className="my-2 h-px bg-white/10" />
          <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span className="truncate">{profile.organization || "SAKAGIS Workspace"}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.reload();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[10px] font-bold text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
          >
            <LogOut className="h-3.5 w-3.5" /> Keluar dari SAKAGIS
          </button>
        </div>
      )}
    </div>
  );
}
