"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  organization: string | null;
  is_approved: boolean;
};

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  isGuest: boolean;
  loginAsGuest: () => void;
  logoutGuest: () => void;
  guestEndTime: number | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [guestEndTime, setGuestEndTime] = useState<number | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (mounted) {
          setSession(session);
          setUser(session?.user || null);
          
          if (session?.user) {
            await fetchProfile(session.user.id);
          }
        }
      } catch (e) {
        console.error("Auth init error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user || null);
        
        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const logoutGuest = () => {
    setIsGuest(false);
    setGuestEndTime(null);
  };

  const loginAsGuest = () => {
    setIsGuest(true);
    const duration = 5 * 60 * 1000; // 5 minutes
    setGuestEndTime(Date.now() + duration);
    
    setTimeout(() => {
      setIsGuest(false);
      setGuestEndTime(null);
      if (typeof window !== "undefined") {
        import("sonner").then(({ toast }) => {
          toast("⏳ Waktu Habis!", {
            description: "Sesi percobaan 5 menit Anda telah usai. Tingkatkan ke Akun SAKAGIS Pro untuk menikmati analisis spasial tanpa batas waktu, fitur edit lanjutan, dan penyimpanan cloud permanen!",
            duration: 15000,
            action: {
              label: "Daftar Akun Pro",
              onClick: () => console.log("Pro upgrade clicked")
            },
            icon: '🚀'
          });
        });
      }
    }, duration);
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, refreshProfile, isGuest, loginAsGuest, logoutGuest, guestEndTime }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
