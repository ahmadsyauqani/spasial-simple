"use client";

import React, { useState, useEffect } from "react";
import { X, Clock, Calendar, MapPin, Globe } from "lucide-react";

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

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  if (!mounted) {
    return (
      <div
        className="fixed z-[41] top-3 hidden lg:block"
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

  const currentYear = time.getFullYear();
  const currentMonth = time.getMonth();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  // Generate calendar grid
  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(<div key={`empty-${i}`} className="text-center p-1"></div>);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === time.getDate();
    calendarDays.push(
      <div 
        key={`day-${d}`} 
        className={`text-center p-1.5 text-xs rounded-md transition-colors ${
          isToday ? "bg-indigo-500 text-white font-bold shadow-md shadow-indigo-500/30" : "text-slate-300 hover:bg-white/10 cursor-pointer"
        }`}
      >
        {d}
      </div>
    );
  }

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
        className="fixed z-[41] top-3 hidden lg:block"
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
            <div className="relative flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 border-indigo-500/70 bg-gradient-to-br from-indigo-950/95 to-slate-950/95 shadow-[0_4px_24px_rgba(99,102,241,0.25)] transition-all duration-300 hover:border-indigo-400 hover:shadow-[0_4px_30px_rgba(99,102,241,0.5)] select-none z-20">
              <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider leading-none mb-0.5">
                {dayName}
              </span>
              <span className="text-sm font-bold text-white font-mono leading-none tracking-tight my-0.5">
                {hourStr}:{minStr}
              </span>
              <span className="text-[8px] text-slate-400 font-bold uppercase leading-none mt-0.5">
                {dateStr}
              </span>
            </div>

            {/* Subtle Notification Badge if not open */}
            {!isOpen && (
              <span className="absolute top-0 left-0 flex h-4 w-4 z-30">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 border-2 border-background"></span>
              </span>
            )}
          </div>

          {/* Hover Tooltip - simple version when closed */}
          {isHovered && !isOpen && (
            <div className="absolute top-full mt-3 left-0 w-48 bg-card/95 backdrop-blur-xl border border-border/40 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl p-3 text-sm pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200 origin-top-left z-10">
              <div 
                className="absolute -top-1.5 w-3 h-3 bg-card/95 border-t border-l border-border/40 transform rotate-45"
                style={{ left: "26px" }}
              />
              <span className="text-xs font-semibold text-white block mb-1">
                {getGreeting(time.getHours())}
              </span>
              <span className="text-sm font-bold text-indigo-300 font-mono tracking-wide">
                {time.toLocaleTimeString("id-ID", { hour12: false })}
              </span>
            </div>
          )}

          {/* Expanded Interactive Widget */}
          {isOpen && (
            <div className="absolute top-full mt-3 left-0 w-[300px] sm:w-[340px] bg-background/95 backdrop-blur-xl border border-border/50 shadow-[0_12px_40px_rgba(0,0,0,0.4)] rounded-3xl overflow-hidden flex flex-col pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300 origin-top-left z-50">
              
              {/* Pointer Triangle */}
              <div 
                className="absolute -top-1.5 w-3 h-3 bg-indigo-950 border-t border-l border-border/50 transform rotate-45 z-10"
                style={{ left: "26px" }}
              />

              {/* Widget Header - Giant Clock */}
              <div className="relative z-20 bg-gradient-to-br from-indigo-950/90 to-slate-900 border-b border-border/30 p-6 pt-5">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="absolute top-4 right-4 text-indigo-300 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex flex-col items-center text-center mt-2">
                  <h3 className="text-[13px] font-medium text-indigo-200 mb-1 flex items-center gap-1.5">
                    {getGreeting(time.getHours())}
                  </h3>
                  <div className="text-5xl font-black text-white font-mono tracking-wider drop-shadow-lg my-1">
                    {time.toLocaleTimeString("id-ID", { hour12: false })}
                  </div>
                  <div className="flex items-center gap-2 mt-3 bg-black/40 px-3.5 py-1.5 rounded-full border border-indigo-500/30 backdrop-blur-sm">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs text-indigo-100 font-medium tracking-wide">
                      {days[time.getDay()]}, {time.getDate()} {months[time.getMonth()]} {currentYear}
                    </span>
                  </div>
                </div>
              </div>

              {/* Widget Body */}
              <div className="p-5 flex flex-col gap-4">
                {/* Mini Calendar Grid */}
                <div className="bg-card/40 border border-border/40 rounded-2xl p-4 shadow-inner">
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {daysShort.map((day) => (
                      <div key={day} className="text-center text-[10px] font-bold text-slate-500">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays}
                  </div>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card/40 border border-border/40 rounded-xl p-3 flex flex-col gap-1 hover:bg-card/60 transition-colors group cursor-default">
                    <Globe className="w-4 h-4 text-indigo-400 mb-1 group-hover:scale-110 group-hover:text-indigo-300 transition-all" />
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Zona Waktu</span>
                    <span className="text-[13px] font-bold text-white">WIB (UTC+7)</span>
                  </div>
                  <div className="bg-card/40 border border-border/40 rounded-xl p-3 flex flex-col gap-1 hover:bg-card/60 transition-colors group cursor-default">
                    <MapPin className="w-4 h-4 text-indigo-400 mb-1 group-hover:scale-110 group-hover:text-indigo-300 transition-all" />
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Info Spasial</span>
                    <span className="text-[13px] font-bold text-white flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      Sistem Aktif
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
