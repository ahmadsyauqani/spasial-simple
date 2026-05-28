"use client";

import { MessageCircle, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function PendingApproval() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const whatsappLink = "https://wa.me/6281378432067?text=Halo%20Admin%20SAKAGIS,%0ASaya%20telah%20mendaftar%20akun%20PRO.%20Berikut%20saya%20lampirkan%20*bukti%20pendaftaran%20dan%20pembayaran*%20agar%20akun%20saya%20dapat%20segera%20diaktifkan.%20Terima%20kasih.";

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 relative">

      <div className="w-full max-w-md bg-card/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl p-8 text-center relative z-10">
        <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">⏳</span>
        </div>
        
        <h2 className="text-xl font-bold text-white mb-2">Menunggu Persetujuan</h2>
        <p className="text-sm text-white/60 mb-8 leading-relaxed">
          Akun Anda telah berhasil didaftarkan. Untuk mengaktifkan akun PRO Anda, silakan hubungi Admin via WhatsApp dengan mengirimkan <b>bukti pendaftaran dan pembayaran</b>.
        </p>

        <a 
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-[#25D366] hover:bg-[#1DA851] text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-[#25D366]/20 transition-all flex justify-center items-center gap-2 mb-4"
        >
          <MessageCircle className="w-5 h-5" />
          Hubungi Admin via WhatsApp
        </a>

        <button 
          onClick={handleLogout}
          className="text-xs font-bold text-white/40 hover:text-white uppercase tracking-wider flex items-center gap-1 mx-auto transition-colors mt-6"
        >
          <LogOut className="w-3.5 h-3.5" />
          Keluar (Logout)
        </button>
      </div>
    </div>
  );
}
