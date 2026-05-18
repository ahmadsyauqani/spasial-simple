import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { PAPER_SIZES, type PaperSize, type Orientation } from "./useLayoutComposer";

export type ExportDPI = 72 | 150 | 300;

function safeColor(c: string): string {
  if (!c) return c;
  if (c.includes("oklch") || c.includes("lab(")) return "rgb(248, 250, 252)";
  return c;
}

function copyComputedStyles(src: Element, dst: HTMLElement) {
  try {
    const cs = window.getComputedStyle(src);
    const props = [
      "color", "backgroundColor", "borderColor",
      "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
      "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "borderStyle", "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
      "fontSize", "fontWeight", "fontFamily", "fontStyle",
      "lineHeight", "letterSpacing", "textAlign", "textTransform", "textDecoration",
      "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "display", "flexDirection", "alignItems", "justifyContent", "flexWrap",
      "gap", "rowGap", "columnGap",
      "position", "top", "left", "right", "bottom",
      "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
      "overflow", "overflowX", "overflowY",
      "opacity", "visibility",
      "boxSizing", "verticalAlign", "whiteSpace",
      "fill", "stroke",
      "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow",
      "tableLayout",
    ];
    for (const prop of props) {
      try {
        const val = cs.getPropertyValue(prop.replace(/([A-Z])/g, "-$1").toLowerCase());
        if (val) (dst.style as any)[prop] = safeColor(val);
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Capture a Leaflet map to a canvas data URL.
 * Uses getBoundingClientRect() difference for positioning — the most reliable method
 * for elements inside modals (scroll/viewport offset cancels in the subtraction).
 */
async function captureLeafletMapAsDataUrl(container: HTMLElement): Promise<string | null> {
  try {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return null;

    const dpr = 2; // 2x for crisp output
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Fill background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);

    const containerRect = container.getBoundingClientRect();

    // ── Draw tile images ──────────────────────────────────────────────────────
    // Use getBoundingClientRect() difference: containerRect cancels out any
    // scroll/viewport offsets, giving the tile position *relative to container*.
    container.querySelectorAll(".leaflet-tile-pane img").forEach((el) => {
      const tile = el as HTMLImageElement;
      if (!tile.complete || tile.naturalWidth === 0) return;
      try {
        const r = tile.getBoundingClientRect();
        const tx = r.left - containerRect.left;
        const ty = r.top - containerRect.top;
        // Clip to container bounds before drawing to avoid overdraw
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.drawImage(tile, tx, ty, r.width, r.height);
        ctx.restore();
      } catch (e) {}
    });

    // ── Draw SVG GeoJSON overlay ──────────────────────────────────────────────
    const overlayPane = container.querySelector(".leaflet-overlay-pane") as HTMLElement;
    const svg = overlayPane?.querySelector("svg") as SVGSVGElement | null;
    if (svg && overlayPane) {
      try {
        const sr = svg.getBoundingClientRect();
        const svgX = sr.left - containerRect.left;
        const svgY = sr.top - containerRect.top;
        const svgW = sr.width || svg.clientWidth || w;
        const svgH = sr.height || svg.clientHeight || h;

        // Clone SVG and stamp explicit dimensions for reliable rendering
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("width", String(Math.round(svgW)));
        clone.setAttribute("height", String(Math.round(svgH)));
        if (!clone.getAttribute("viewBox")) {
          clone.setAttribute("viewBox", `0 0 ${Math.round(svgW)} ${Math.round(svgH)}`);
        }

        const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], {
          type: "image/svg+xml;charset=utf-8",
        });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, w, h);
            ctx.clip();
            ctx.drawImage(img, svgX, svgY, svgW, svgH);
            ctx.restore();
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          img.src = url;
        });
      } catch (e) { console.warn("SVG overlay capture error:", e); }
    }

    // ── Draw canvas overlays (WebGL / heatmap) ────────────────────────────────
    if (overlayPane) {
      overlayPane.querySelectorAll("canvas").forEach((el) => {
        try {
          const r = el.getBoundingClientRect();
          ctx.drawImage(
            el as HTMLCanvasElement,
            r.left - containerRect.left,
            r.top - containerRect.top,
            r.width,
            r.height
          );
        } catch (e) {}
      });
    }

    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("Failed to capture Leaflet map:", e);
    return null;
  }
}

function createOnCloneHandler(
  canvasElement: HTMLElement,
  mapCaptures: Map<Element, string>
) {
  // Read inline background BEFORE clone (set directly in JSX — always reliable)
  const inlineBg = canvasElement.style.backgroundColor;

  return (clonedDoc: Document) => {
    const paper = clonedDoc.querySelector(".layout-paper") as HTMLElement;
    if (!paper) return;

    clonedDoc
      .querySelectorAll("#__vercel-toolbar, [data-vercel-toolbar], script")
      .forEach((el) => el.remove());

    // Replace Leaflet containers with captured images
    const origMaps = Array.from(canvasElement.querySelectorAll(".leaflet-container"));
    const clonedMaps = Array.from(paper.querySelectorAll(".leaflet-container"));
    origMaps.forEach((origMap, idx) => {
      const dataUrl = mapCaptures.get(origMap);
      const clonedMap = clonedMaps[idx];
      if (dataUrl && clonedMap?.parentElement) {
        const parent = clonedMap.parentElement;
        const img = clonedDoc.createElement("img");
        img.src = dataUrl;
        img.style.cssText = "width:100%;height:100%;display:block;object-fit:fill;";
        parent.innerHTML = "";
        parent.appendChild(img);
        parent.style.overflow = "hidden";
      }
    });

    // Deep-copy computed styles for tagged elements
    Array.from(canvasElement.querySelectorAll("[data-layout-id]")).forEach((origEl) => {
      const id = origEl.getAttribute("data-layout-id");
      if (!id) return;
      const clonedEl = paper.querySelector(`[data-layout-id="${id}"]`) as HTMLElement;
      if (!clonedEl) return;

      // ── CRITICAL: Save the inline % layout values BEFORE copyComputedStyles ──
      // copyComputedStyles returns pixel values (from zoom=0.7 canvas) which would
      // overwrite the percentage-based layout, breaking proportions in the export.
      const origElHtml = origEl as HTMLElement;
      const savedLayout: Record<string, string> = {};
      const layoutProps = ["position", "left", "top", "right", "bottom", "width", "height"];
      layoutProps.forEach((p) => {
        const v = origElHtml.style.getPropertyValue(p);
        if (v) savedLayout[p] = v;
      });

      copyComputedStyles(origEl, clonedEl);

      // ── Restore the original inline % layout values ──
      Object.entries(savedLayout).forEach(([p, v]) => {
        clonedEl.style.setProperty(p, v);
      });

      const elType = origEl.getAttribute("data-element-type");
      if (elType !== "infoBlock" && elType !== "legend") clonedEl.style.overflow = "visible";

      // Copy styles to children — also preserve their inline width/height (usually "100%")
      const origChildren = Array.from(origEl.querySelectorAll("*"));
      Array.from(clonedEl.querySelectorAll("*")).forEach((child, i) => {
        const origChild = origChildren[i] as HTMLElement | undefined;
        const clonedChild = child as HTMLElement;
        if (!origChild || !clonedChild.style) return;

        // Save child inline width/height (e.g. "100%") before they get overwritten
        const savedChildW = origChild.style?.width;
        const savedChildH = origChild.style?.height;

        copyComputedStyles(origChild, clonedChild);

        // Restore child inline layout values
        if (savedChildW) clonedChild.style.width = savedChildW;
        if (savedChildH) clonedChild.style.height = savedChildH;

        // Force-copy color values (prevent them from going missing)
        const cs = window.getComputedStyle(origChild);
        const col = cs.getPropertyValue("color");
        if (col) clonedChild.style.color = safeColor(col);
        const bg = cs.getPropertyValue("background-color");
        if (bg && bg !== "rgba(0, 0, 0, 0)") clonedChild.style.backgroundColor = safeColor(bg);
      });
    });

    // Apply paper styles — RESTORE real background color from inline style
    copyComputedStyles(canvasElement, paper);
    paper.style.backgroundColor = inlineBg ? safeColor(inlineBg) : "#ffffff";
    paper.style.position = "relative";
    paper.style.overflow = "hidden";
    paper.style.margin = "0";
    paper.style.transform = "none";
    paper.style.top = "0";
    paper.style.left = "0";
    // Restore paper dimensions from inline style (must stay in px at current zoom)
    if (canvasElement.style.width) paper.style.width = canvasElement.style.width;
    if (canvasElement.style.height) paper.style.height = canvasElement.style.height;

    const style = clonedDoc.createElement("style");
    style.innerHTML = `
      * { box-sizing: border-box !important; }
      table { border-collapse: collapse !important; }
      body { background: transparent !important; margin: 0 !important; padding: 0 !important; }
    `;
    clonedDoc.head.appendChild(style);
  };
}


export async function exportToPNG(
  canvasElement: HTMLElement,
  paperSize: PaperSize,
  orientation: Orientation,
  customWidth?: number,
  customHeight?: number,
  dpi: ExportDPI = 300,
  canvasZoom: number = 1.0
): Promise<Blob> {
  // Pre-capture maps at CURRENT zoom (tiles already loaded — no zoom change)
  const mapCaptures = new Map<Element, string>();
  for (const c of Array.from(canvasElement.querySelectorAll(".leaflet-container"))) {
    const url = await captureLeafletMapAsDataUrl(c as HTMLElement);
    if (url) mapCaptures.set(c, url);
  }

  const hideStyle = document.createElement("style");
  hideStyle.textContent = `
    .leaflet-tile-pane, .leaflet-map-pane, .leaflet-control-container,
    .leaflet-overlay-pane, .leaflet-shadow-pane, .leaflet-marker-pane,
    .leaflet-tooltip-pane, .leaflet-popup-pane { display: none !important; }
  `;
  document.head.appendChild(hideStyle);

  try {
    // Compensate for canvasZoom so physical output size is correct
    const scale = (dpi / 96) / canvasZoom;

    const canvas = await html2canvas(canvasElement, {
      scale,
      useCORS: true,
      backgroundColor: null,  // transparent — element's own background shows
      logging: false,
      allowTaint: true,
      ignoreElements: (el) =>
        el.classList?.contains("layout-handle") ||
        el.classList?.contains("layout-toolbar-overlay") ||
        el.classList?.contains("element-controls"),
      onclone: createOnCloneHandler(canvasElement, mapCaptures),
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas to blob failed"))),
        "image/png",
        1.0
      );
    });
  } finally {
    hideStyle.remove();
  }
}

export async function exportToPDF(
  canvasElement: HTMLElement,
  paperSize: PaperSize,
  orientation: Orientation,
  customWidth?: number,
  customHeight?: number,
  dpi: ExportDPI = 300,
  canvasZoom: number = 1.0
): Promise<Blob> {
  const mapCaptures = new Map<Element, string>();
  for (const c of Array.from(canvasElement.querySelectorAll(".leaflet-container"))) {
    const url = await captureLeafletMapAsDataUrl(c as HTMLElement);
    if (url) mapCaptures.set(c, url);
  }

  const hideStyle = document.createElement("style");
  hideStyle.textContent = `
    .leaflet-tile-pane, .leaflet-map-pane, .leaflet-control-container,
    .leaflet-overlay-pane, .leaflet-shadow-pane, .leaflet-marker-pane,
    .leaflet-tooltip-pane, .leaflet-popup-pane { display: none !important; }
  `;
  document.head.appendChild(hideStyle);

  try {
    const scale = (dpi / 96) / canvasZoom;

    const canvas = await html2canvas(canvasElement, {
      scale,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      allowTaint: true,
      ignoreElements: (el) =>
        el.classList?.contains("layout-handle") ||
        el.classList?.contains("layout-toolbar-overlay") ||
        el.classList?.contains("element-controls"),
      onclone: createOnCloneHandler(canvasElement, mapCaptures),
    });

    const size = PAPER_SIZES[paperSize] || { width: customWidth || 210, height: customHeight || 297 };
    let pdfW = orientation === "landscape" ? Math.max(size.width, size.height) : Math.min(size.width, size.height);
    let pdfH = orientation === "landscape" ? Math.min(size.width, size.height) : Math.max(size.width, size.height);

    const pdf = new jsPDF({ orientation: orientation === "landscape" ? "l" : "p", unit: "mm", format: [pdfW, pdfH] });
    pdf.addImage(canvas.toDataURL("image/png", 1.0), "PNG", 0, 0, pdfW, pdfH);
    return pdf.output("blob");
  } finally {
    hideStyle.remove();
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
