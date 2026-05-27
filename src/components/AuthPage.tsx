"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, Phone, Building2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { refreshProfile } = useAuth();
  
  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Berhasil masuk!");
        await refreshProfile();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone,
              organization: organization,
            }
          }
        });
        if (error) throw error;
        toast.success("Pendaftaran berhasil! Silakan hubungi admin untuk aktivasi.");
        await refreshProfile();
      }
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan saat autentikasi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-4 relative">

      <div className="w-full max-w-md bg-card/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl p-8 relative z-10">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative p-2">
              <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full scale-150" />
              <img src="/logo-sakagis.png" alt="SAKAGIS" className="w-12 h-12 object-contain relative dark:invert dark:mix-blend-screen" />
            </div>
          </div>
          <h1 className="text-2xl font-black bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent tracking-tight">
            SAKAGIS
          </h1>
          <p className="text-sm text-white/50 font-medium tracking-wide uppercase mt-1">
            Spatial Studio
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-black/20 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${isLogin ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white/70'}`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${!isLogin ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white/70'}`}
          >
            Daftar
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider pl-1">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-white/40" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                placeholder="email@contoh.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider pl-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-white/40" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {!isLogin && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider pl-1">Nama Lengkap</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-white/40" />
                  </div>
                  <input
                    type="text"
                    required={!isLogin}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    placeholder="Nama Lengkap Anda"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider pl-1">Nomor HP / WhatsApp</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-white/40" />
                  </div>
                  <input
                    type="tel"
                    required={!isLogin}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    placeholder="081234567890"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider pl-1">Instansi / Organisasi</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-4 w-4 text-white/40" />
                  </div>
                  <input
                    type="text"
                    required={!isLogin}
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    placeholder="Nama Instansi"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-[0.98] mt-4 flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : isLogin ? "Masuk ke SAKAGIS" : "Daftar Akun"}
          </button>
        </form>
      </div>
    </div>
  );
}
