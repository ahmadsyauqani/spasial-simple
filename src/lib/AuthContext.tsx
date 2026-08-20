"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  organization: string | null;
  is_approved: boolean;
};

const HARDCODED_EMAIL = "123@sakagis.com";
const HARDCODED_PASSWORD = "sakagis";

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
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [guestEndTime, setGuestEndTime] = useState<number | null>(null);

  const login = async (email: string, password: string) => {
    if (email.trim().toLowerCase() === HARDCODED_EMAIL && password === HARDCODED_PASSWORD) {
      setUser({
        id: "sakagis-local",
        email: HARDCODED_EMAIL,
      } as User);
      setProfile({
        id: "sakagis-local",
        full_name: "SAKAGIS Admin",
        phone: null,
        organization: "SAKAGIS",
        is_approved: true,
      });
      return { error: null };
    }
    return { error: "Email atau password salah" };
  };

  const logout = () => {
    setUser(null);
    setProfile(null);
    setIsGuest(false);
    setGuestEndTime(null);
  };

  const refreshProfile = async () => {};

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
    <AuthContext.Provider value={{
      user,
      profile,
      session: null,
      loading: false,
      refreshProfile,
      isGuest,
      loginAsGuest,
      logoutGuest,
      guestEndTime,
      login,
      logout
    }}>
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
