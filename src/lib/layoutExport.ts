import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { PAPER_SIZES, type PaperSize, type Orientation } from "./useLayoutComposer";

export type ExportDPI = 72 | 150 | 300;

/**
 * Helper: convert any oklch/lab color string to a safe RGB fallback.
 */
function safeColor(c: string): string {
  if (!c) return c;
  if (c.includes("oklch") || c.includes("lab(")) return "rgb(248, 250, 252)";
  return c;
}

/**
 * Deep-copy key computed styles from src to dst inline style.
 */
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
        if (val) {
          (dst.style as any)[prop] = safeColor(val);
        }
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Capture a Leaflet map as a static image using manual canvas compositing.
 * Reads existing loaded tile images and draws them; no html2canvas involved.
 */
async function captureLeafletMapAsDataUrl(container: HTMLElement): Promise<string | null> {
  try {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);

    // Get map pane offset
    const mapPane = container.querySelector(".leaflet-map-pane") as HTMLElement;
    let mapOx = 0, mapOy = 0;
    if (mapPane) {
      const t = window.getComputedStyle(mapPane).transform;
      if (t && t !== "none") {
        const m = t.match(/matrix\(([^)]+)\)/);
        if (m) { const v = m[1].split(",").map(Number); mapOx = v[4] || 0; mapOy = v[5] || 0; }
      }
    }

    // Draw tiles
    const tilePane = container.querySelector(".leaflet-tile-pane") as HTMLElement;
    if (tilePane) {
      tilePane.querySelectorAll("img").forEach((tile) => {
        if (!tile.complete || tile.naturalWidth === 0) return;
        try {
          const parent = tile.parentElement;
          let tx = 0, ty = 0;
          if (parent) {
            const pt = window.getComputedStyle(parent).transform;
            if (pt && pt !== "none") {
              const pm = pt.match(/matrix\(([^)]+)\)/);
              if (pm) { const pv = pm[1].split(",").map(Number); tx = pv[4] || 0; ty = pv[5] || 0; }
            }
          }
          const tt = window.getComputedStyle(tile).transform;
          if (tt && tt !== "none") {
            const tm = tt.match(/matrix\(([^)]+)\)/);
            if (tm) { const tv = tm[1].split(",").map(Number); tx += tv[4] || 0; ty += tv[5] || 0; }
          }
          if (tx === 0 && ty === 0 && parent) {
            tx = tile.offsetLeft + (parent.offsetLeft || 0);
            ty = tile.offsetTop + (parent.offsetTop || 0);
          }
          ctx.drawImage(tile, tx + mapOx, ty + mapOy, tile.width || 256, tile.height || 256);
        } catch (e) {}
      });
    }

    // Draw SVG overlays (GeoJSON layers)
    const svg = container.querySelector(".leaflet-overlay-pane svg") as SVGSVGElement;
    if (svg) {
      try {
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => {
            const sr = svg.getBoundingClientRect();
            const cr = container.getBoundingClientRect();
            ctx.drawImage(img, sr.left - cr.left, sr.top - cr.top, sr.width, sr.height);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          img.src = url;
        });
      } catch (e) {}
    }

    // Draw canvas overlays
    container.querySelectorAll(".leaflet-overlay-pane canvas").forEach((c) => {
      try {
        const el = c as HTMLCanvasElement;
        const r = el.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        ctx.drawImage(el, r.left - cr.left, r.top - cr.top, r.width, r.height);
      } catch (e) {}
    });

    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("Failed to capture Leaflet map:", e);
    return null;
  }
}

/**
 * The onclone handler for html2canvas.
 * 1. Replaces Leaflet containers with pre-captured static images
 * 2. Deep-copies computed styles to resolve oklch colors
 */
function createOnCloneHandler(
  canvasElement: HTMLElement,
  mapCaptures: Map<Element, string>
) {
  return (clonedDoc: Document) => {
    const paper = clonedDoc.querySelector(".layout-paper") as HTMLElement;
    if (!paper) return;

    // Remove intrusive elements
    clonedDoc
      .querySelectorAll("#__vercel-toolbar, [data-vercel-toolbar], script")
      .forEach((el) => el.remove());

    // 1. Replace Leaflet maps with captured images
    const originalMaps = Array.from(canvasElement.querySelectorAll(".leaflet-container"));
    const clonedMaps = Array.from(paper.querySelectorAll(".leaflet-container"));

    originalMaps.forEach((origMap, idx) => {
      const dataUrl = mapCaptures.get(origMap);
      const clonedMap = clonedMaps[idx];
      if (dataUrl && clonedMap && clonedMap.parentElement) {
        const parent = clonedMap.parentElement;
        const img = clonedDoc.createElement("img");
        img.src = dataUrl;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        parent.innerHTML = "";
        parent.appendChild(img);
        parent.style.overflow = "hidden";
      }
    });

    // 2. Deep-copy computed styles for tagged layout elements
    const originalElements = Array.from(
      canvasElement.querySelectorAll("[data-layout-id]")
    );

    originalElements.forEach((origEl) => {
      const id = origEl.getAttribute("data-layout-id");
      if (!id) return;
      const clonedEl = paper.querySelector(
        `[data-layout-id="${id}"]`
      ) as HTMLElement;
      if (!clonedEl) return;

      copyComputedStyles(origEl, clonedEl);
      clonedEl.style.overflow = "visible";

      const origChildren = Array.from(origEl.querySelectorAll("*"));
      const clonedChildren = Array.from(clonedEl.querySelectorAll("*"));
      clonedChildren.forEach((child, i) => {
        const origChild = origChildren[i];
        if (origChild && (child as HTMLElement).style) {
          copyComputedStyles(origChild, child as HTMLElement);
        }
      });
    });

    // 3. Copy paper styles
    copyComputedStyles(canvasElement, paper);
    paper.style.backgroundColor = "white";
    paper.style.position = "relative";
    paper.style.overflow = "hidden";
    paper.style.margin = "0";
    paper.style.transform = "none";

    // 4. Minimal CSS reset
    const style = clonedDoc.createElement("style");
    style.innerHTML = `
      * { box-sizing: border-box !important; }
      table { border-collapse: collapse !important; }
    `;
    clonedDoc.head.appendChild(style);
  };
}

/**
 * Export the layout canvas DOM element to a PNG blob
 */
export async function exportToPNG(
  canvasElement: HTMLElement,
  paperSize: PaperSize,
  orientation: Orientation,
  customWidth?: number,
  customHeight?: number,
  dpi: ExportDPI = 300
): Promise<Blob> {
  // Step 1: Pre-capture Leaflet maps
  const mapCaptures = new Map<Element, string>();
  const containers = canvasElement.querySelectorAll(".leaflet-container");
  for (const c of Array.from(containers)) {
    const url = await captureLeafletMapAsDataUrl(c as HTMLElement);
    if (url) mapCaptures.set(c, url);
  }

  // Step 2: Hide Leaflet tiles via CSS (prevents html2canvas from processing them)
  const hideStyle = document.createElement("style");
  hideStyle.id = "export-hide-leaflet";
  hideStyle.textContent = `
    .leaflet-tile-pane, .leaflet-map-pane, .leaflet-control-container,
    .leaflet-overlay-pane, .leaflet-shadow-pane, .leaflet-marker-pane,
    .leaflet-tooltip-pane, .leaflet-popup-pane { display: none !important; }
  `;
  document.head.appendChild(hideStyle);

  try {
    const scale = dpi / 96;

    const canvas = await html2canvas(canvasElement, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      allowTaint: true,
      ignoreElements: (el) => {
        return (
          el.classList?.contains("layout-handle") ||
          el.classList?.contains("layout-toolbar-overlay") ||
          el.classList?.contains("element-controls")
        );
      },
      onclone: createOnCloneHandler(canvasElement, mapCaptures),
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Gagal mengkonversi canvas ke PNG."));
        },
        "image/png",
        1.0
      );
    });
  } finally {
    // Step 3: Always restore Leaflet tiles
    hideStyle.remove();
  }
}

/**
 * Export the layout canvas DOM element to a PDF blob
 */
export async function exportToPDF(
  canvasElement: HTMLElement,
  paperSize: PaperSize,
  orientation: Orientation,
  customWidth?: number,
  customHeight?: number,
  dpi: ExportDPI = 300
): Promise<Blob> {
  // Step 1: Pre-capture Leaflet maps
  const mapCaptures = new Map<Element, string>();
  const containers = canvasElement.querySelectorAll(".leaflet-container");
  for (const c of Array.from(containers)) {
    const url = await captureLeafletMapAsDataUrl(c as HTMLElement);
    if (url) mapCaptures.set(c, url);
  }

  // Step 2: Hide Leaflet tiles via CSS
  const hideStyle = document.createElement("style");
  hideStyle.id = "export-hide-leaflet-pdf";
  hideStyle.textContent = `
    .leaflet-tile-pane, .leaflet-map-pane, .leaflet-control-container,
    .leaflet-overlay-pane, .leaflet-shadow-pane, .leaflet-marker-pane,
    .leaflet-tooltip-pane, .leaflet-popup-pane { display: none !important; }
  `;
  document.head.appendChild(hideStyle);

  try {
    const scale = dpi / 96;

    const canvas = await html2canvas(canvasElement, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      allowTaint: true,
      ignoreElements: (el) => {
        return (
          el.classList?.contains("layout-handle") ||
          el.classList?.contains("layout-toolbar-overlay") ||
          el.classList?.contains("element-controls")
        );
      },
      onclone: createOnCloneHandler(canvasElement, mapCaptures),
    });

    const size = PAPER_SIZES[paperSize] || {
      width: customWidth || 210,
      height: customHeight || 297,
    };
    let pdfWidth: number, pdfHeight: number;

    if (orientation === "landscape") {
      pdfWidth = Math.max(size.width, size.height);
      pdfHeight = Math.min(size.width, size.height);
    } else {
      pdfWidth = Math.min(size.width, size.height);
      pdfHeight = Math.max(size.width, size.height);
    }

    const pdf = new jsPDF({
      orientation: orientation === "landscape" ? "l" : "p",
      unit: "mm",
      format: [pdfWidth, pdfHeight],
    });

    const imgData = canvas.toDataURL("image/png", 1.0);
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    return pdf.output("blob");
  } finally {
    hideStyle.remove();
  }
}

/**
 * Trigger file download from a blob
 */
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
