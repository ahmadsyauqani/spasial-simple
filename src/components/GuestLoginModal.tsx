"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Check, BookOpen, Sparkles } from "lucide-react";

export function GuestLoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { loginAsGuest } = useAuth();
  const [hasRead, setHasRead] = useState(false);

  if (!isOpen) return null;

  const handleEnter = () => {
    if (hasRead) {
      loginAsGuest();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-[#121212] border border-white/10 rounded-[2rem] w-full max-w-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh] relative animate-in zoom-in-95 duration-300">
        
        {/* Glow Effects */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="p-8 border-b border-white/5 flex flex-col items-center text-center shrink-0 relative z-10 bg-black/20">
          <div className="relative mb-4">
            <div className="w-14 h-14 bg-gradient-to-tr from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.3)] rotate-3 transition-transform hover:rotate-6">
              <BookOpen className="w-7 h-7 text-white -rotate-3" />
            </div>
            <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-yellow-300 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Syarat Masuk Guest</h2>
          <p className="text-sm text-white/50 mt-2 max-w-md">Silakan baca Surah Al-Fatihah di bawah ini dengan saksama sebelum memulai sesi pemetaan di SAKAGIS.</p>
        </div>

        {/* Content - Scrollable without visible scrollbar */}
        <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-6 relative z-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 mb-6">
               <div className="h-px bg-white/10 flex-1" />
               <h3 className="font-bold text-sm uppercase tracking-widest text-orange-400">Surah Al-Fatihah</h3>
               <div className="h-px bg-white/10 flex-1" />
            </div>

            <div className="space-y-4 text-right" dir="rtl">
              {[
                { arabic: "بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ", latin: "Bismillāhir-raḥmānir-raḥīm(i)", indo: "Dengan nama Allah Yang Maha Pengasih, Maha Penyayang." },
                { arabic: "اَلْحَمْدُ لِلّٰهِ رَبِّ الْعٰلَمِيْنَۙ", latin: "Al-ḥamdu lillāhi rabbil-'ālamīn(a)", indo: "Segala puji bagi Allah, Tuhan seluruh alam," },
                { arabic: "الرَّحْمٰنِ الرَّحِيْمِۙ", latin: "Ar-raḥmānir-raḥīm(i)", indo: "Yang Maha Pengasih, Maha Penyayang," },
                { arabic: "مٰلِكِ يَوْمِ الدِّيْنِۗ", latin: "Māliki yaumid-dīn(i)", indo: "Pemilik hari pembalasan." },
                { arabic: "اِيَّاكَ نَعْبُدُ وَاِيَّاكَ نَسْتَعِيْنُۗ", latin: "Iyyāka na'budu wa iyyāka nasta'īn(u)", indo: "Hanya kepada Engkaulah kami menyembah dan hanya kepada Engkaulah kami mohon pertolongan." },
                { arabic: "اِهْدِنَا الصِّرَاطَ الْمُسْتَقِيْمَۙ", latin: "Ihdinaṣ-ṣirāṭal-mustaqīm(a)", indo: "Tunjukilah kami jalan yang lurus," },
                { arabic: "صِرَاطَ الَّذِيْنَ اَنْعَمْتَ عَلَيْهِمْ ەۙ غَيْرِ الْمَغْضُوْبِ عَلَيْهِمْ وَلَا الضَّاۤلِّيْنَ ࣖ", latin: "Ṣirāṭal-lażīna an'amta 'alaihim, gairil-magḍūbi 'alaihim wa laḍ-ḍāllīn(a)", indo: "(yaitu) jalan orang-orang yang telah Engkau beri nikmat kepadanya; bukan (jalan) mereka yang dimurkai, dan bukan (pula jalan) mereka yang sesat." }
              ].map((verse, idx) => (
                <div key={idx} className="p-5 md:p-6 bg-white/[0.02] rounded-2xl border border-white/5 hover:bg-white/[0.04] hover:border-orange-500/30 transition-all duration-300 group cursor-default">
                  <div className="flex items-start gap-4">
                    <span className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-xs font-bold text-white/30 group-hover:text-orange-400 group-hover:border-orange-500/30 transition-colors shrink-0 mt-2">{idx + 1}</span>
                    <div className="flex-1">
                      <p className="text-[28px] md:text-3xl font-arabic leading-[2.5] text-white drop-shadow-md">{verse.arabic}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/5 space-y-1.5" dir="ltr">
                    <p className="text-xs font-medium text-orange-200/70 italic">{verse.latin}</p>
                    <p className="text-sm text-white/70 font-sans text-left leading-relaxed">{verse.indo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 md:p-8 border-t border-white/5 shrink-0 bg-black/40 relative z-10 backdrop-blur-xl">
          <label className="flex items-center gap-4 cursor-pointer group mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
            <div className={`shrink-0 w-6 h-6 rounded-[6px] border-[1.5px] flex items-center justify-center transition-all duration-300 ${hasRead ? 'bg-orange-500 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'border-white/30 group-hover:border-orange-500/50 bg-black/50'}`}>
              <Check className={`w-4 h-4 text-white transition-transform duration-300 ${hasRead ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} />
            </div>
            <input type="checkbox" className="hidden" checked={hasRead} onChange={(e) => setHasRead(e.target.checked)} />
            <span className={`text-sm md:text-base font-semibold select-none transition-colors duration-300 ${hasRead ? 'text-white' : 'text-white/60 group-hover:text-white/80'}`}>
              Saya bersaksi telah membaca Surah Al-Fatihah dengan sepenuh hati.
            </span>
          </label>
          
          <div className="flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 text-sm font-bold text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
            >
              Kembali
            </button>
            <button 
              onClick={handleEnter}
              disabled={!hasRead}
              className={`flex-[2] py-4 text-sm font-black rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${hasRead ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:scale-[1.02] active:scale-[0.98]' : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'}`}
            >
              Mulai Sesi (5 Menit)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
