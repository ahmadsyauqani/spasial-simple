"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceUI } from "@/lib/WorkspaceUIContext";

export type AnalysisToolDefinition = { key: string; label: string; category: string; description: string; icon: string; component: React.ReactNode; };
const FAVORITES_KEY = "sakagis-layer-analysis-favorites-v1";
const RECENT_KEY = "sakagis-layer-analysis-recent-v1";

export function AnalysisCatalog({ tools }: { tools: AnalysisToolDefinition[] }) {
  const { request, consumeRequest } = useWorkspaceUI();
  const root = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const categories = ["Semua", ...new Set(tools.map((tool) => tool.category))];
  const validKeys = tools.map((tool) => tool.key).join(",");
  useEffect(() => {
    const read = (key: string) => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && validKeys.split(",").includes(id)))] : [];
      } catch { return []; }
    };
    setFavorites(read(FAVORITES_KEY));
    setRecent(read(RECENT_KEY).slice(0, 4));
  }, [validKeys]);
  const persist = (key: string, ids: string[]) => {
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Session-only when storage is unavailable. */ }
  };
  const toggleFavorite = (key: string) => {
    const next = favorites.includes(key) ? favorites.filter((id) => id !== key) : [...favorites, key];
    setFavorites(next); persist(FAVORITES_KEY, next);
  };
  const recordUse = (key: string) => {
    const next = [key, ...recent.filter((id) => id !== key)].slice(0, 4);
    setRecent(next); persist(RECENT_KEY, next);
  };
  // Keep one mounted copy of each tool: filtering/history must not discard open dialogs or results.
  const triggerTool = (key: string) => {
    const trigger = root.current?.querySelector<HTMLButtonElement>(`[data-tool-key="${key}"] .layer-workspace-analysis-trigger > button`);
    if (!trigger || trigger.disabled || trigger.getAttribute("aria-disabled") === "true") {
      toast.info("Siapkan layer yang diperlukan sebelum membuka alat ini."); return;
    }
    setQuery(""); setCategory("Semua");
    requestAnimationFrame(() => { trigger.focus(); trigger.click(); });
  };
  const triggerRef = useRef(triggerTool);
  triggerRef.current = triggerTool;
  useEffect(() => {
    if (request?.target !== "analysis" || !request.toolKey) return;
    if (validKeys.split(",").includes(request.toolKey)) triggerRef.current(request.toolKey);
    consumeRequest(request.token);
  }, [request, consumeRequest, validKeys]);
  const matches = (tool: AnalysisToolDefinition) => (category === "Semua" || category === tool.category) && `${tool.label} ${tool.description} ${tool.category}`.toLocaleLowerCase("id-ID").includes(query.trim().toLocaleLowerCase("id-ID"));
  const shortcut = (key: string) => {
    const tool = tools.find((item) => item.key === key);
    return tool ? <button type="button" key={key} onClick={() => triggerTool(key)}>{tool.label}</button> : null;
  };
  return (
    <section ref={root} className="layer-workspace-analysis" aria-label="Katalog analisis">
      <div className="layer-workspace-section-heading"><div><strong>Katalog analisis</strong><span>Atur parameter sebelum menjalankan. Data asli tetap utuh.</span></div><span className="layer-workspace-count">{tools.length} alat</span></div>
      <div className="layer-workspace-shortcuts">
        <div><strong><Star size={13} /> Favorit</strong><div>{favorites.length ? favorites.map(shortcut) : <span>Tandai bintang pada alat yang sering dipakai.</span>}</div></div>
        <div><strong><Clock3 size={13} /> Terakhir dipakai</strong><div>{recent.length ? recent.map(shortcut) : <span>Alat yang dibuka akan muncul di sini.</span>}</div></div>
      </div>
      <label className="layer-workspace-analysis-search"><Search size={14} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari tool analisis..." aria-label="Cari tool analisis" /></label>
      <div className="layer-workspace-analysis-tabs" aria-label="Kategori analisis">
        {categories.map((item) => <button type="button" aria-pressed={category === item} key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}>{item}</button>)}
      </div>
      {categories.filter((item) => item !== "Semua").map((group) => (
        <section className="layer-workspace-analysis-section" key={group} hidden={!tools.some((tool) => tool.category === group && matches(tool))}>
          <h3 className="layer-workspace-analysis-section-title">{group}</h3>
          <div className="layer-workspace-analysis-grid">{tools.filter((tool) => tool.category === group).map((tool) => (
            <article className="layer-workspace-analysis-card" key={tool.key} data-tool-key={tool.key} data-testid={`analysis-tool-${tool.key}`} hidden={!matches(tool)}>
              <div className="layer-workspace-analysis-icon" aria-hidden="true">{tool.icon}</div>
              <div className="layer-workspace-analysis-copy"><strong>{tool.label}</strong><span>{tool.description}</span></div>
              <button type="button" className="layer-workspace-analysis-favorite" aria-label={favorites.includes(tool.key) ? `Hapus ${tool.label} dari favorit` : `Tambah ${tool.label} ke favorit`} aria-pressed={favorites.includes(tool.key)} onClick={() => toggleFavorite(tool.key)}><Star size={14} fill={favorites.includes(tool.key) ? "currentColor" : "none"} /></button>
              <div className="layer-workspace-analysis-trigger" onClick={(event) => {
                const button = event.target instanceof Element ? event.target.closest("button") : null;
                // React portal clicks and disabled controls are not launches.
                if (button && button.parentElement === event.currentTarget && !button.disabled && button.getAttribute("aria-disabled") !== "true") recordUse(tool.key);
              }}>{tool.component}</div>
            </article>
          ))}</div>
        </section>
      ))}
      {!tools.some(matches) && <div className="layer-workspace-empty">Alat tidak ditemukan. <button type="button" onClick={() => { setQuery(""); setCategory("Semua"); }}>Reset pencarian</button></div>}
    </section>
  );
}
