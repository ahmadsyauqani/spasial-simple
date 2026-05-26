"use client";

import React, { useState } from "react";
import { X } from "lucide-react";

export function DraggableAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      {/* Floating animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes assistant-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        .assistant-float {
          animation: assistant-float 3s ease-in-out infinite;
        }
        .assistant-float:hover {
          animation-play-state: paused;
        }
      `}} />

      {/* 
        Positioned to the right of the search bar.
        SearchControl = absolute top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[450px]
        So avatar sits right after it: left-1/2 + half of 450px + gap
      */}
      <div
        className="fixed z-[41] top-[18px]"
        style={{
          left: "calc(50% + 240px)",
        }}
      >
        <div className="relative">
          {/* Chat Bubble - appears above */}
          {(isHovered || isOpen) && (
            <div className="absolute bottom-full mb-3 right-0 w-56 bg-card/95 backdrop-blur-xl border border-border/40 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl p-4 text-sm pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 origin-bottom-right">
              <div className="flex justify-between items-start mb-2.5">
                <span className="font-bold text-orange-400 text-xs flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                  </span>
                  Asisten SAKAGIS
                </span>
                <button 
                  onClick={() => { setIsOpen(false); setIsHovered(false); }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Halo bro! Saya siap bantu analisis spasial hari ini. Mau digitasi atau cek peta? 🗺️
              </p>
              
              {/* Triangle pointer */}
              <div className="absolute -bottom-1.5 right-5 w-3 h-3 bg-card/95 border-b border-r border-border/40 transform rotate-45" />
            </div>
          )}

          {/* Avatar */}
          <div 
            className="relative cursor-pointer assistant-float"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setIsOpen(!isOpen)}
          >
            {/* Avatar circle */}
            <div className="relative flex items-center justify-center w-10 h-10 rounded-full overflow-hidden border-2 border-orange-500/70 bg-gradient-to-br from-gray-900 to-black shadow-[0_4px_20px_rgba(249,115,22,0.25)] transition-all duration-300 hover:border-orange-400 hover:shadow-[0_4px_24px_rgba(249,115,22,0.4)]">
              <img 
                src="/small-dancing-white-cat-dance-funny.gif" 
                alt="Asisten SAKAGIS" 
                className="w-[85%] h-[85%] object-contain" 
                draggable="false"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
