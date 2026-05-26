"use client";

import React, { useState, useEffect } from "react";
import { X, Clock } from "lucide-react";

const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const daysShort = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
const monthsShort = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN", 
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES"
];
const months = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export function ClockWidget() {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(new Date());
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = (hour: number) => {
    if (hour >= 5 && hour < 11) return "Selamat Pagi, Bro! 🌅";
    if (hour >= 11 && hour < 15) return "Selamat Siang, Bro! ☀️";
    if (hour >= 15 && hour < 19) return "Selamat Sore, Bro! 🌇";
    return "Selamat Malam, Bro! 🌙";
  };

  if (!mounted) {
    return (
      <div
        className="fixed z-[41] top-3"
        style={{ right: "calc(50% + 240px)" }}
      >
        <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 bg-slate-950/80 animate-pulse" />
      </div>
    );
  }

  const hourStr = time.getHours().toString().padStart(2, "0");
  const minStr = time.getMinutes().toString().padStart(2, "0");
  const dayName = daysShort[time.getDay()];
  const dateStr = `${time.getDate()} ${monthsShort[time.getMonth()]}`;

  return (
    <>
      {/* Floating animation in counter-harmony with assistant */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes clock-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        .clock-float {
          animation: clock-float 3s ease-in-out infinite;
          animation-delay: 1.5s;
        }
        .clock-float:hover {
          animation-play-state: paused;
        }
      `}} />

      {/* Symmetric positioning on the left of search bar */}
      <div
        className="fixed z-[41] top-3"
        style={{
          right: "calc(50% + 240px)",
        }}
      >
        <div className="relative">
          {/* Clock Circle */}
          <div 
            className="relative cursor-pointer clock-float"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setIsOpen(!isOpen)}
          >
            {/* Glassmorphic circle matching avatar layout but with indigo theme */}
            <div className="relative flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 border-indigo-500/70 bg-gradient-to-br from-indigo-950/95 to-slate-950/95 shadow-[0_4px_24px_rgba(99,102,241,0.25)] transition-all duration-300 hover:border-indigo-400 hover:shadow-[0_4px_30px_rgba(99,102,241,0.5)] select-none">
              {/* Day short */}
              <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider leading-none mb-0.5">
                {dayName}
              </span>
              {/* Time HH:MM */}
              <span className="text-sm font-bold text-white font-mono leading-none tracking-tight my-0.5">
                {hourStr}:{minStr}
              </span>
              {/* Date */}
              <span className="text-[8px] text-slate-400 font-bold uppercase leading-none mt-0.5">
                {dateStr}
              </span>
            </div>
          </div>

          {/* Details Dropdown/Bubble - appears BELOW the clock */}
          {(isHovered || isOpen) && (
            <div className="absolute top-full mt-3 left-0 w-56 bg-card/95 backdrop-blur-xl border border-border/40 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl p-4 text-sm pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200 origin-top-left">
              {/* Triangle pointer - at top (centered under the 64px clock) */}
              <div 
                className="absolute -top-1.5 w-3 h-3 bg-card/95 border-t border-l border-border/40 transform rotate-45"
                style={{ left: "26px" }}
              />
              
              <div className="flex justify-between items-start mb-2.5">
                <span className="font-bold text-indigo-400 text-xs flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Info Waktu
                </span>
                <button 
                  onClick={() => { setIsOpen(false); setIsHovered(false); }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                {/* Greeting */}
                <span className="text-xs font-semibold text-white">
                  {getGreeting(time.getHours())}
                </span>
                
                {/* Full Time with ticking seconds */}
                <span className="text-xl font-bold text-indigo-300 font-mono tracking-wide mt-1">
                  {time.toLocaleTimeString("id-ID", { hour12: false })}
                </span>
                
                {/* Full Date */}
                <span className="text-[11px] text-slate-400 font-medium">
                  {days[time.getDay()]}, {time.getDate()} {months[time.getMonth()]} {time.getFullYear()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
