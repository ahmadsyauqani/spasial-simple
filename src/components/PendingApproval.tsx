"use client";

import { useState } from "react";
import { MessageCircle, LogOut, Copy, CheckCircle2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function PendingApproval() {
  const [copied, setCopied] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText("081378432067");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappLink = "https://wa.me/6281378432067?text=Halo%20Admin%20SAKAGIS,%0ASaya%20telah%20mendaftar%20akun%20PRO.%20Berikut%20saya%20lampirkan%20*bukti%20pendaftaran%20dan%20pembayaran*%20agar%20akun%20saya%20dapat%20segera%20diaktifkan.%20Terima%20kasih.";

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 relative">

      <div className="w-full max-w-md bg-[#121212] backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] p-8 text-center relative z-10 animate-in zoom-in-95 duration-300">
        
        {/* Glowing Background */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-16 h-16 bg-gradient-to-tr from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_rgba(249,115,22,0.3)]">
          <span className="text-2xl animate-pulse">⏳</span>
        </div>
        
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Menunggu Persetujuan</h2>
        <p className="text-sm text-white/60 mb-6 leading-relaxed">
          Akun Anda telah berhasil didaftarkan. Untuk mengaktifkan akun PRO Anda, ikuti instruksi pembayaran di bawah ini.
        </p>

        {/* Payment Info Box */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 mb-6 text-left relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-500 to-amber-600" />
          
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-5 h-5 text-orange-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">Informasi Pembayaran</h3>
          </div>
          <p className="text-xs text-white/60 mb-4 leading-relaxed">
            Silakan lakukan transfer pendaftaran PRO melalui dompet digital berikut:
          </p>
          
          <div className="flex gap-3 mb-4">
            <div className="flex-1 bg-[#4C2A86]/20 border border-[#4C2A86]/50 rounded-xl py-2 flex items-center justify-center font-black text-white tracking-wider text-sm shadow-[0_0_10px_rgba(76,42,134,0.3)]">
              OVO
            </div>
            <div className="flex-1 bg-[#00AED6]/20 border border-[#00AED6]/50 rounded-xl py-2 flex items-center justify-center font-black text-white tracking-wider text-sm shadow-[0_0_10px_rgba(0,174,214,0.3)]">
              GOPAY
            </div>
          </div>

          <div className="flex items-center justify-between bg-black/50 border border-white/5 rounded-xl p-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Nomor Transfer</p>
              <p className="text-lg font-mono font-bold text-orange-400 tracking-widest drop-shadow-md">081378432067</p>
            </div>
            <button 
              onClick={handleCopy}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/60 hover:text-white flex items-center justify-center"
              title="Salin Nomor"
            >
              {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <a 
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-gradient-to-r from-[#25D366] to-[#1DA851] hover:from-[#1DA851] hover:to-[#198E44] text-white font-black py-3.5 px-4 rounded-xl shadow-[0_0_20px_rgba(37,211,102,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] flex justify-center items-center gap-2 mb-6"
        >
          <MessageCircle className="w-5 h-5" />
          Kirim Bukti Pembayaran ke WA
        </a>

        <button 
          onClick={handleLogout}
          className="text-xs font-bold text-white/40 hover:text-white uppercase tracking-wider flex items-center gap-1.5 mx-auto transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Keluar (Logout)
        </button>
      </div>
    </div>
  );
}
