"use client";

import React, { useState } from "react";
import Draggable from "react-draggable";
import { X, MessageCircle } from "lucide-react";

export function DraggableAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const nodeRef = React.useRef(null);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <Draggable
      nodeRef={nodeRef}
      bounds="parent"
      defaultPosition={{ x: window.innerWidth - 100, y: window.innerHeight - 150 }}
      onStart={() => setIsDragging(true)}
      onStop={() => {
        // Small delay to prevent click event triggering immediately after drag stops
        setTimeout(() => setIsDragging(false), 100);
      }}
    >
      <div ref={nodeRef} className="absolute z-[9999] cursor-grab active:cursor-grabbing group">
        
        {/* Chat Bubble (shows on hover or when open) */}
        {(isHovered || isOpen) && !isDragging && (
          <div className="absolute bottom-[110%] right-0 mb-2 w-48 bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl p-3 text-sm animate-in fade-in slide-in-from-bottom-2 duration-300 origin-bottom-right">
            <div className="flex justify-between items-start mb-1">
              <span className="font-bold text-orange-400 text-xs">Asisten SAKAGIS</span>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
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
          className="relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => {
            if (!isDragging) setIsOpen(!isOpen);
          }}
        >
          {/* Glowing effect */}
          <div className="absolute inset-0 bg-orange-500/30 blur-xl rounded-full scale-125 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          <div className="relative flex items-center justify-center w-16 h-16 rounded-full overflow-hidden border-2 border-orange-500/80 shadow-[0_0_20px_rgba(249,115,22,0.4)] bg-card/50 backdrop-blur-sm transition-transform hover:scale-110">
            <img 
              src="/small-dancing-white-cat-dance-funny.gif" 
              alt="Asisten SAKAGIS" 
              className="w-full h-full object-cover scale-[1.2]" 
              draggable="false"
            />
          </div>

          {/* Badge icon */}
          <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white rounded-full p-1.5 shadow-lg border-2 border-background">
            <MessageCircle className="w-3.5 h-3.5" />
          </div>
        </div>

      </div>
    </Draggable>
  );
}
