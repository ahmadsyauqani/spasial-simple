"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, Send, Map, Search, Layers, Sparkles } from "lucide-react";
import { Button } from "./ui/button";

interface Message {
  id: string;
  role: "assistant" | "user";
  text: string;
}

export function DraggableAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      text: "Halo bro! Saya SAKAGIS, siap bantu analisis spasial hari ini. Ada yang bisa saya bantu?",
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;

    const newUserMsg: Message = { id: Date.now().toString(), role: "user", text };
    setMessages((prev) => [...prev, newUserMsg]);
    setInputValue("");

    // Mock response
    setTimeout(() => {
      const responseText = getMockResponse(text);
      const newAssistantMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", text: responseText };
      setMessages((prev) => [...prev, newAssistantMsg]);
    }, 1000);
  };

  const getMockResponse = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes("digitasi")) return "Oke, mari kita mulai proses digitasi. Silakan pilih alat draw di peta sebelah kiri untuk mulai menggambar poligon atau garis.";
    if (lower.includes("buffer")) return "Analisis buffer siap! Silakan masukkan jarak buffer yang diinginkan (misal: 100 meter).";
    if (lower.includes("cari") || lower.includes("lokasi")) return "Mencari lokasi... Anda bisa ketikkan nama tempat di kolom pencarian utama di atas.";
    return "Menarik! Fitur ini sedang dalam pengembangan. Ada lagi yang ingin dicoba terkait pemetaan?";
  };

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
        /* Custom scrollbar for chat */
        .chat-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .chat-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}} />

      <div
        className="fixed z-[41] top-3"
        style={{
          left: "calc(50% + 240px)",
        }}
      >
        <div className="relative">
          {/* Avatar */}
          <div 
            className="relative cursor-pointer assistant-float"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setIsOpen(!isOpen)}
          >
            {/* Avatar circle */}
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full overflow-hidden border-2 border-orange-500/70 bg-gradient-to-br from-gray-900 to-black shadow-[0_4px_24px_rgba(249,115,22,0.3)] transition-all duration-300 hover:border-orange-400 hover:shadow-[0_4px_30px_rgba(249,115,22,0.55)]">
              <img 
                src="/small-dancing-white-cat-dance-funny.gif" 
                alt="Asisten SAKAGIS" 
                className="w-[85%] h-[85%] object-contain" 
                draggable="false"
              />
            </div>
            
            {/* Notification Badge if not open */}
            {!isOpen && (
              <span className="absolute top-0 right-0 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500 border-2 border-background"></span>
              </span>
            )}
          </div>

          {/* Simple Tooltip on Hover (only when closed) */}
          {isHovered && !isOpen && (
            <div className="absolute top-full mt-3 right-0 w-56 bg-card/95 backdrop-blur-xl border border-border/40 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl p-4 text-sm pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
              <div 
                className="absolute -top-1.5 w-3 h-3 bg-card/95 border-t border-l border-border/40 transform rotate-45"
                style={{ right: "26px" }}
              />
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                <span className="font-bold text-orange-400 block mb-1">Halo bro! 👋</span>
                Klik saya untuk mulai chat dan analisis spasial bareng SAKAGIS.
              </p>
            </div>
          )}

          {/* Expanded Chat Window */}
          {isOpen && (
            <div className="absolute top-full mt-3 right-0 w-[320px] sm:w-[380px] bg-background/95 backdrop-blur-xl border border-border/50 shadow-[0_12px_40px_rgba(0,0,0,0.4)] rounded-2xl overflow-hidden flex flex-col pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300 origin-top-right z-50 h-[450px]">
              
              {/* Pointer Triangle */}
              <div 
                className="absolute -top-1.5 w-3 h-3 bg-background/95 border-t border-l border-border/50 transform rotate-45 z-10"
                style={{ right: "26px" }}
              />

              {/* Chat Header */}
              <div className="relative z-20 flex justify-between items-center p-4 border-b border-border/30 bg-card/50">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden border border-orange-500/50 bg-black">
                     <img 
                      src="/small-dancing-white-cat-dance-funny.gif" 
                      alt="Asisten SAKAGIS" 
                      className="w-full h-full object-contain" 
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm flex items-center gap-1.5 text-foreground">
                      Asisten SAKAGIS
                      <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">Selalu Siap Membantu</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-muted-foreground hover:text-foreground hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Body */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 chat-scrollbar">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                  >
                    <div 
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm
                        ${msg.role === "user" 
                          ? "bg-orange-500 text-white rounded-tr-sm" 
                          : "bg-muted/50 border border-border/50 text-foreground rounded-tl-sm"
                        }
                      `}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Actions / Suggestions */}
              <div className="px-4 pb-3 flex gap-2 overflow-x-auto chat-scrollbar whitespace-nowrap">
                <Button 
                  variant="outline" 
                  size="xs" 
                  className="rounded-full text-[11px] border-orange-500/20 hover:bg-orange-500/10 hover:text-orange-400 bg-background"
                  onClick={() => handleSendMessage("Mau digitasi peta")}
                >
                  <Map className="w-3 h-3 mr-1" /> Digitasi
                </Button>
                <Button 
                  variant="outline" 
                  size="xs" 
                  className="rounded-full text-[11px] border-orange-500/20 hover:bg-orange-500/10 hover:text-orange-400 bg-background"
                  onClick={() => handleSendMessage("Analisis Buffer")}
                >
                  <Layers className="w-3 h-3 mr-1" /> Buffer
                </Button>
                <Button 
                  variant="outline" 
                  size="xs" 
                  className="rounded-full text-[11px] border-orange-500/20 hover:bg-orange-500/10 hover:text-orange-400 bg-background"
                  onClick={() => handleSendMessage("Cari Lokasi")}
                >
                  <Search className="w-3 h-3 mr-1" /> Cari Lokasi
                </Button>
              </div>

              {/* Chat Footer */}
              <div className="p-3 border-t border-border/30 bg-card/30">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Tanya SAKAGIS..."
                    className="w-full bg-background border border-border/50 rounded-full pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim()}
                    className="absolute right-1.5 p-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
