"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Check, BookOpen } from "lucide-react";

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
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-lg rounded-3xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-border/50 flex flex-col items-center text-center shrink-0">
          <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-3">
            <BookOpen className="w-6 h-6 text-orange-500" />
          </div>
          <h2 className="text-xl font-black text-foreground">Syarat Masuk Guest</h2>
          <p className="text-xs text-muted-foreground mt-1">Silakan baca Surah Al-Fatihah di bawah ini sebelum memasuki aplikasi SAKAGIS.</p>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          <div className="space-y-4">
            <div className="text-center">
               <h3 className="font-bold text-lg text-primary mb-1">Surah Al-Fatihah (Pembukaan)</h3>
            </div>

            <div className="space-y-4 text-right" dir="rtl">
              <div className="p-4 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-2xl font-arabic leading-loose mb-2 text-foreground">1. بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</p>
                <p className="text-xs text-muted-foreground font-sans text-left" dir="ltr">Artinya: Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.</p>
              </div>

              <div className="p-4 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-2xl font-arabic leading-loose mb-2 text-foreground">2. اَلْحَمْدُ لِلّٰهِ رَبِّ الْعٰلَمِيْنَۙ</p>
                <p className="text-xs text-muted-foreground font-sans text-left" dir="ltr">Artinya: Segala puji bagi Allah, Tuhan seluruh alam,</p>
              </div>

              <div className="p-4 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-2xl font-arabic leading-loose mb-2 text-foreground">3. الرَّحْمٰنِ الرَّحِيْمِۙ</p>
                <p className="text-xs text-muted-foreground font-sans text-left" dir="ltr">Artinya: Yang Maha Pengasih, Maha Penyayang,</p>
              </div>

              <div className="p-4 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-2xl font-arabic leading-loose mb-2 text-foreground">4. مٰلِكِ يَوْمِ الدِّيْنِۗ</p>
                <p className="text-xs text-muted-foreground font-sans text-left" dir="ltr">Artinya: Pemilik hari pembalasan.</p>
              </div>

              <div className="p-4 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-2xl font-arabic leading-loose mb-2 text-foreground">5. اِيَّاكَ نَعْبُدُ وَاِيَّاكَ نَسْتَعِيْنُۗ</p>
                <p className="text-xs text-muted-foreground font-sans text-left" dir="ltr">Artinya: Hanya kepada Engkaulah kami menyembah dan hanya kepada Engkaulah kami mohon pertolongan.</p>
              </div>

              <div className="p-4 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-2xl font-arabic leading-loose mb-2 text-foreground">6. اِهْدِنَا الصِّرَاطَ الْمُسْتَقِيْمَۙ</p>
                <p className="text-xs text-muted-foreground font-sans text-left" dir="ltr">Artinya: Tunjukilah kami jalan yang lurus,</p>
              </div>

              <div className="p-4 bg-muted/30 rounded-xl border border-border/30">
                <p className="text-2xl font-arabic leading-loose mb-2 text-foreground">7. صِرَاطَ الَّذِيْنَ اَنْعَمْتَ عَلَيْهِمْ ەۙ غَيْرِ الْمَغْضُوْبِ عَلَيْهِمْ وَلَا الضَّاۤلِّيْنَ ࣖ</p>
                <p className="text-xs text-muted-foreground font-sans text-left" dir="ltr">Artinya: (yaitu) jalan orang-orang yang telah Engkau beri nikmat kepadanya; bukan (jalan) mereka yang dimurkai, dan bukan (pula jalan) mereka yang sesat.</p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/50 shrink-0 bg-muted/10">
          <label className="flex items-start gap-3 cursor-pointer group mb-4">
            <div className={`mt-0.5 shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${hasRead ? 'bg-orange-500 border-orange-500' : 'border-muted-foreground/50 group-hover:border-orange-500/50'}`}>
              {hasRead && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            <input type="checkbox" className="hidden" checked={hasRead} onChange={(e) => setHasRead(e.target.checked)} />
            <span className="text-sm font-medium text-foreground select-none">Saya bersaksi telah membaca Surah Al-Fatihah di atas dengan sepenuh hati.</span>
          </label>
          
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all"
            >
              Kembali
            </button>
            <button 
              onClick={handleEnter}
              disabled={!hasRead}
              className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all shadow-lg ${hasRead ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20' : 'bg-muted text-muted-foreground/50 cursor-not-allowed shadow-none'}`}
            >
              Mulai Sesi (5 Menit)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
