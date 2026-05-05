"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="w-10 h-10" />;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border border-border bg-card text-foreground hover:bg-accent shadow-sm"
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-orange-400 animate-in zoom-in duration-300" />
      ) : (
        <Moon className="w-4 h-4 text-indigo-500 animate-in zoom-in duration-300" />
      )}
    </button>
  );
}
