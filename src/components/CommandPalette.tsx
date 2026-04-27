"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Calculator, Layers, MousePointer2, Scissors, Upload, LayoutGrid } from "lucide-react";
import { useMapContext } from "@/lib/MapContext";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { setLayoutComposerOpen } = useMapContext();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Ketik perintah atau pencarian..." />
        <CommandList>
          <CommandEmpty>Hasil tidak ditemukan.</CommandEmpty>
          <CommandGroup heading="Analisis Spasial">
            <CommandItem onSelect={() => console.log("Hitung Luas")}>
              <Calculator className="mr-2 h-4 w-4" />
              <span>Hitung Luas (Area)</span>
            </CommandItem>
            <CommandItem onSelect={() => console.log("Intersect Layer")}>
              <Scissors className="mr-2 h-4 w-4" />
              <span>Intersection (Overlay)</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Aksi Layer">
            <CommandItem onSelect={() => console.log("Upload File")}>
              <Upload className="mr-2 h-4 w-4" />
              <span>Upload Dataset (SHP/KML/DXF)</span>
              <CommandShortcut>⌘U</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => console.log("Kelola Layer")}>
              <Layers className="mr-2 h-4 w-4" />
              <span>Kelola Layer Terunggah</span>
            </CommandItem>
            <CommandItem onSelect={() => { setLayoutComposerOpen(true); setOpen(false); }}>
              <LayoutGrid className="mr-2 h-4 w-4" />
              <span>Buat Layout Peta (Print Map)</span>
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

