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
    setPosition({ x: window.innerWidth - 100, y: window.innerHeight - 150 });
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.target.releasePointerCapture(e.pointerId); // Allows dragging outside the element
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
      setPosition({ x: initialX + dx, y: initialY + dy });
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
          <div className="absolute bottom-[110%] right-0 mb-2 w-48 bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl p-3 text-sm animate-in fade-in slide-in-from-bottom-2 duration-300 origin-bottom-right pointer-events-auto">
            <div className="flex justify-between items-start mb-1">
              <span className="font-bold text-orange-400 text-xs">Asisten SAKAGIS</span>
              <button 
                onPointerDown={(e) => { e.stopPropagation(); setIsOpen(false); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Halo bro! Saya siap bantu analisis spasial hari ini. Mau digitasi atau cek peta?
            </p>
            
            {/* Triangle pointer */}
            <div className="absolute -bottom-2 right-5 w-4 h-4 bg-card/95 border-b border-r border-border/50 transform rotate-45" />
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
          <div className="absolute inset-0 bg-orange-500/30 blur-xl rounded-full scale-125 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          
          <div className="relative flex items-center justify-center w-16 h-16 rounded-full overflow-hidden border-2 border-orange-500/80 shadow-[0_0_20px_rgba(249,115,22,0.4)] bg-black transition-transform hover:scale-110 pointer-events-none">
            <img 
              src="/small-dancing-white-cat-dance-funny.gif" 
              alt="Asisten SAKAGIS" 
              className="w-full h-full object-contain" 
              draggable="false"
            />
          </div>

          {/* Badge icon */}
          <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white rounded-full p-1.5 shadow-lg border-2 border-background pointer-events-none">
            <MessageCircle className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
