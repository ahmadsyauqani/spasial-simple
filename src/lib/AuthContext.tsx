"use client";

import { createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";

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

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: false,
  refreshProfile: async () => {},
  isGuest: false,
  loginAsGuest: () => {},
  logoutGuest: () => {},
  guestEndTime: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Auth has been disabled — all users have full public access
  return (
    <AuthContext.Provider value={{
      user: null,
      profile: null,
      session: null,
      loading: false,
      refreshProfile: async () => {},
      isGuest: false,
      loginAsGuest: () => {},
      logoutGuest: () => {},
      guestEndTime: null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
