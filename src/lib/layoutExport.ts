import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { PAPER_SIZES, type PaperSize, type Orientation } from "./useLayoutComposer";

export type ExportDPI = 72 | 150 | 300;

/**
 * Helper: convert any oklch/lab color string to a safe RGB fallback.
 * getComputedStyle already resolves oklch to rgb in most browsers,
 * but if it doesn't (or html2canvas re-parses the string), we catch it.
 */
function safeColor(c: string): string {
  if (!c) return c;
  if (c.includes("oklch") || c.includes("lab(")) return "rgb(248, 250, 252)";
  return c;
}

/**
 * Deep-copy ALL computed styles from one element to another's inline style.
 * This is the nuclear option: we bake every visual property so html2canvas
 * doesn't need to understand ANY CSS (oklch, Tailwind classes, etc).
 */
function copyComputedStyles(src: Element, dst: HTMLElement) {
  try {
    const cs = window.getComputedStyle(src);
    // List of properties that matter for visual rendering
    const props = [
      "color", "backgroundColor", "borderColor",
      "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
      "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "borderStyle", "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
      "fontSize", "fontWeight", "fontFamily", "fontStyle",
      "lineHeight", "letterSpacing", "textAlign", "textTransform", "textDecoration",
      "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
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
        const val = cs.getPropertyValue(
          prop.replace(/([A-Z])/g, "-$1").toLowerCase()
        );
        if (val) {
          (dst.style as any)[prop] = safeColor(val);
        }
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Capture all Leaflet map canvases inside the paper element as images.
 * Returns a Map of leaflet-container element -> dataURL of the rendered map.
 */
async function captureLeafletMaps(paper: HTMLElement): Promise<Map<Element, string>> {
  const result = new Map<Element, string>();
  const mapContainers = paper.querySelectorAll(".leaflet-container");

  for (const container of Array.from(mapContainers)) {
    try {
      // Use html2canvas on the specific Leaflet container at scale 1
      // to get a flat rasterized image of the current map view
      const mapCanvas = await html2canvas(container as HTMLElement, {
        scale: 2, // Good quality
        useCORS: true,
        backgroundColor: null,
        logging: false,
        allowTaint: true,
      });
      result.set(container, mapCanvas.toDataURL("image/png"));
    } catch (e) {
      console.warn("Failed to capture Leaflet map:", e);
    }
  }

  return result;
}

/**
 * The main onclone handler that fixes all rendering issues.
 * Strategy:
 * 1. Replace Leaflet map containers with pre-captured images
 * 2. Deep-copy computed styles to resolve oklch colors
 * 3. Minimal CSS overrides
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

    // ─── 1. Replace Leaflet maps with captured images ───
    // Find the original map containers and their corresponding clones
    const originalMaps = Array.from(canvasElement.querySelectorAll(".leaflet-container"));
    const clonedMaps = Array.from(paper.querySelectorAll(".leaflet-container"));

    originalMaps.forEach((origMap, idx) => {
      const dataUrl = mapCaptures.get(origMap);
      const clonedMap = clonedMaps[idx];
      if (dataUrl && clonedMap && clonedMap.parentElement) {
        const parent = clonedMap.parentElement;
        // Create an img that fills the parent
        const img = clonedDoc.createElement("img");
        img.src = dataUrl;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        // Replace the Leaflet container with the image
        parent.innerHTML = "";
        parent.appendChild(img);
        parent.style.overflow = "hidden";
      }
    });

    // ─── 2. Deep-copy computed styles for ALL tagged layout elements ───
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

      // Copy styles for the element itself
      copyComputedStyles(origEl, clonedEl);
      // Force overflow visible for text elements to prevent clipping
      clonedEl.style.overflow = "visible";

      // Copy styles for ALL children
      const origChildren = Array.from(origEl.querySelectorAll("*"));
      const clonedChildren = Array.from(clonedEl.querySelectorAll("*"));

      clonedChildren.forEach((child, i) => {
        const origChild = origChildren[i];
        if (origChild && (child as HTMLElement).style) {
          copyComputedStyles(origChild, child as HTMLElement);
        }
      });
    });

    // ─── 3. Copy styles for the paper itself ───
    copyComputedStyles(canvasElement, paper);
    paper.style.backgroundColor = "white";
    paper.style.position = "relative";
    paper.style.overflow = "hidden";
    paper.style.margin = "0";
    paper.style.transform = "none";

    // ─── 4. Minimal global CSS reset ───
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
  // Step 1: Pre-capture all Leaflet maps as images
  const mapCaptures = await captureLeafletMaps(canvasElement);

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
        el.classList?.contains("element-controls") ||
        el.classList?.contains("layout-element-selected") === false && el.classList?.contains("layout-element-dragging") === true
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
  // Step 1: Pre-capture all Leaflet maps as images
  const mapCaptures = await captureLeafletMaps(canvasElement);

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

  // Get paper dimensions in mm
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
