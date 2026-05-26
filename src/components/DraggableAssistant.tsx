"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, MessageCircle } from "lucide-react";

export function DraggableAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number; isDragging: boolean }>({
    startX: 0, startY: 0, initialX: 0, initialY: 0, isDragging: false
  });

  useEffect(() => {
    setIsMounted(true);
    // Start next to the central search bar (SearchControl is at top-6, max-w-[450px])
    const searchBarWidth = Math.min(window.innerWidth * 0.9, 450);
    const startX = Math.min(window.innerWidth - 60, window.innerWidth / 2 + searchBarWidth / 2 + 15);
    setPosition({ x: startX, y: 20 });
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).releasePointerCapture(e.pointerId); // Allows dragging outside the element
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
      
      // Add bounds checking to keep it within the screen
      const newX = Math.max(0, Math.min(window.innerWidth - 60, initialX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 60, initialY + dy));
      
      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false;
        setTimeout(() => setIsDragging(false), 50); // delay to prevent click
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

  return (
    <div
      className="fixed z-[9999] group touch-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? "grabbing" : "grab"
      }}
    >
      <div 
        onPointerDown={handlePointerDown}
        className="relative"
      >
        {/* Chat Bubble (shows on hover or when open) */}
        {(isHovered || isOpen) && !isDragging && (
          <div className="absolute bottom-[110%] right-0 mb-2 w-52 bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl p-3.5 text-sm animate-in fade-in slide-in-from-bottom-2 duration-300 origin-bottom-right pointer-events-auto">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-orange-400 text-xs flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                </span>
                Asisten SAKAGIS
              </span>
              <button 
                onPointerDown={(e) => { e.stopPropagation(); setIsOpen(false); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Halo bro! Saya siap bantu analisis spasial hari ini. Mau digitasi atau cek peta?
            </p>
            
            {/* Triangle pointer */}
            <div className="absolute -bottom-2 right-4 w-4 h-4 bg-card/95 border-b border-r border-border/50 transform rotate-45" />
          </div>
        )}

        {/* Avatar Container */}
        <div 
          className="relative pointer-events-auto"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => {
            if (!isDragging) setIsOpen(!isOpen);
          }}
        >
          {/* Glowing effect */}
          <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          
          <div className="relative flex items-center justify-center w-12 h-12 rounded-full overflow-hidden border-2 border-orange-500/80 shadow-[0_0_15px_rgba(249,115,22,0.3)] bg-black transition-transform hover:scale-105 pointer-events-none">
            <img 
              src="/small-dancing-white-cat-dance-funny.gif" 
              alt="Asisten SAKAGIS" 
              className="w-full h-full object-contain" 
              draggable="false"
            />
          </div>

          {/* Badge icon */}
          <div className="absolute -bottom-1 -right-1 bg-gradient-to-br from-orange-400 to-orange-600 text-white rounded-full p-1.5 shadow-lg border-[1.5px] border-background pointer-events-none">
            <MessageCircle className="w-3 h-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
