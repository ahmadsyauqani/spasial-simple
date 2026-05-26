"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, MessageCircle } from "lucide-react";

export function DraggableAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number; isDragging: boolean }>({
    startX: 0, startY: 0, initialX: 0, initialY: 0, isDragging: false
  });

  const AVATAR_SIZE = 48; // w-12 = 48px
  const MARGIN = 20;

  useEffect(() => {
    setIsMounted(true);
    // Position at bottom-right corner, away from all other UI elements
    const startX = window.innerWidth - AVATAR_SIZE - MARGIN;
    const startY = window.innerHeight - AVATAR_SIZE - MARGIN;
    setPosition({ x: startX, y: startY });
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).releasePointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
      isDragging: true
    };
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragRef.current.isDragging) return;
      const { startX, startY, initialX, initialY } = dragRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Mark as dragged if moved more than 5px (to distinguish from click)
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setHasDragged(true);
      }
      
      const newX = Math.max(8, Math.min(window.innerWidth - AVATAR_SIZE - 8, initialX + dx));
      const newY = Math.max(8, Math.min(window.innerHeight - AVATAR_SIZE - 8, initialY + dy));
      
      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false;
        setTimeout(() => {
          setIsDragging(false);
          setHasDragged(false);
        }, 80);
      }
    };

    if (isDragging) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

  if (!isMounted) return null;

  // Determine if bubble should go up or down based on position
  const isNearBottom = position.y > window.innerHeight / 2;
  // Determine if bubble should go left or right
  const isNearRight = position.x > window.innerWidth / 2;

  return (
    <>
      {/* Floating animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes assistant-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        .assistant-float {
          animation: assistant-float 3s ease-in-out infinite;
        }
        .assistant-float:hover {
          animation-play-state: paused;
        }
      `}} />
      
      <div
        ref={containerRef}
        className="fixed z-[9999] touch-none"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? "grabbing" : "grab",
        }}
      >
        <div 
          onPointerDown={handlePointerDown}
          className="relative"
        >
          {/* Chat Bubble */}
          {(isHovered || isOpen) && !isDragging && (
            <div 
              className={`absolute w-56 bg-card/95 backdrop-blur-xl border border-border/40 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl p-4 text-sm pointer-events-auto
                animate-in fade-in duration-200
                ${isNearBottom 
                  ? "bottom-full mb-3 slide-in-from-bottom-2" 
                  : "top-full mt-3 slide-in-from-top-2"
                }
                ${isNearRight ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left"}
              `}
            >
              <div className="flex justify-between items-start mb-2.5">
                <span className="font-bold text-orange-400 text-xs flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                  </span>
                  Asisten SAKAGIS
                </span>
                <button 
                  onPointerDown={(e) => { e.stopPropagation(); setIsOpen(false); setIsHovered(false); }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Halo bro! Saya siap bantu analisis spasial hari ini. Mau digitasi atau cek peta? 🗺️
              </p>
              
              {/* Triangle pointer - dynamically positioned */}
              <div 
                className={`absolute w-3 h-3 bg-card/95 border-border/40 transform rotate-45 
                  ${isNearBottom 
                    ? "-bottom-1.5 border-b border-r" 
                    : "-top-1.5 border-t border-l"
                  }
                  ${isNearRight ? "right-5" : "left-5"}
                `} 
              />
            </div>
          )}

          {/* Avatar Container */}
          <div 
            className={`relative pointer-events-auto ${!isDragging ? "assistant-float" : ""}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => {
              if (!isDragging && !hasDragged) setIsOpen(!isOpen);
            }}
          >
            {/* Outer glow ring (visible on hover) */}
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-orange-500/30 to-amber-500/20 blur-md opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            {/* Pulse ring animation */}
            <div className={`absolute -inset-1 rounded-full border-2 border-orange-500/40 pointer-events-none transition-opacity duration-300 ${isOpen ? "animate-ping opacity-30" : "opacity-0"}`} />

            {/* Main avatar circle */}
            <div className="relative flex items-center justify-center w-12 h-12 rounded-full overflow-hidden border-2 border-orange-500/70 bg-gradient-to-br from-gray-900 to-black shadow-[0_4px_20px_rgba(249,115,22,0.25)] transition-all duration-300 hover:border-orange-400 hover:shadow-[0_4px_24px_rgba(249,115,22,0.4)] pointer-events-none">
              <img 
                src="/small-dancing-white-cat-dance-funny.gif" 
                alt="Asisten SAKAGIS" 
                className="w-[85%] h-[85%] object-contain" 
                draggable="false"
              />
            </div>

            {/* Badge icon - smaller and tighter */}
            <div className="absolute -bottom-0.5 -right-0.5 bg-gradient-to-br from-orange-400 to-orange-600 text-white rounded-full p-1 shadow-lg border-[1.5px] border-background pointer-events-none">
              <MessageCircle className="w-2.5 h-2.5" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

