import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { PAPER_SIZES, type PaperSize, type Orientation } from "./useLayoutComposer";

export type ExportDPI = 72 | 150 | 300;

/**
 * Export the layout canvas DOM element to a PNG blob
 */
export async function exportToPNG(
  canvasElement: HTMLElement,
  dpi: ExportDPI = 300
): Promise<Blob> {
  const scale = dpi / 96; // html2canvas uses 96dpi as base

  const canvas = await html2canvas(canvasElement, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    // Ignore interactive controls
    ignoreElements: (el) => {
      return el.classList?.contains("layout-handle") ||
             el.classList?.contains("layout-toolbar-overlay") ||
             el.classList?.contains("element-controls");
    },
    onclone: (clonedDoc) => {
      // html2canvas fails on modern CSS color functions like lab() or oklch()
      // common in Tailwind 4 and the Vercel Toolbar.
      
      // 1. Remove Vercel Toolbar which is a known source of this error
      const vercelElements = clonedDoc.querySelectorAll('#__vercel-toolbar, [data-vercel-toolbar]');
      vercelElements.forEach(el => el.remove());

      // 2. Sanitize ALL style tags in the cloned document
      const styles = clonedDoc.getElementsByTagName("style");
      for (let i = 0; i < styles.length; i++) {
        try {
          const s = styles[i];
          if (s.innerHTML.includes("lab(") || s.innerHTML.includes("oklch(")) {
            s.innerHTML = s.innerHTML
              .replace(/lab\([^)]+\)/g, "rgb(0,0,0)")
              .replace(/oklch\([^)]+\)/g, "rgb(0,0,0)");
          }
        } catch (e) {
          // Some style tags might be restricted or empty
        }
      }

      // 3. Sanitize inline styles on all elements
      clonedDoc.querySelectorAll("*").forEach((el: any) => {
        if (el.style?.cssText && (el.style.cssText.includes("lab(") || el.style.cssText.includes("oklch("))) {
          el.style.cssText = el.style.cssText
            .replace(/lab\([^)]+\)/g, "rgb(0,0,0)")
            .replace(/oklch\([^)]+\)/g, "rgb(0,0,0)");
        }
      });
    }
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Gagal mengkonversi canvas ke PNG."));
    }, "image/png", 1.0);
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
  const scale = dpi / 96;

  const canvas = await html2canvas(canvasElement, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    ignoreElements: (el) => {
      return el.classList?.contains("layout-handle") ||
             el.classList?.contains("layout-toolbar-overlay") ||
             el.classList?.contains("element-controls");
    },
    onclone: (clonedDoc) => {
      // 1. Remove Vercel Toolbar which is a known source of this error
      const vercelElements = clonedDoc.querySelectorAll('#__vercel-toolbar, [data-vercel-toolbar]');
      vercelElements.forEach(el => el.remove());

      // 2. Sanitize ALL style tags in the cloned document
      const styles = clonedDoc.getElementsByTagName("style");
      for (let i = 0; i < styles.length; i++) {
        try {
          const s = styles[i];
          if (s.innerHTML.includes("lab(") || s.innerHTML.includes("oklch(")) {
            s.innerHTML = s.innerHTML
              .replace(/lab\([^)]+\)/g, "rgb(0,0,0)")
              .replace(/oklch\([^)]+\)/g, "rgb(0,0,0)");
          }
        } catch (e) { }
      }

      // 3. Sanitize inline styles on all elements
      clonedDoc.querySelectorAll("*").forEach((el: any) => {
        if (el.style?.cssText && (el.style.cssText.includes("lab(") || el.style.cssText.includes("oklch("))) {
          el.style.cssText = el.style.cssText
            .replace(/lab\([^)]+\)/g, "rgb(0,0,0)")
            .replace(/oklch\([^)]+\)/g, "rgb(0,0,0)");
        }
      });
    }
  });

  // Get paper dimensions in mm
  const size = PAPER_SIZES[paperSize] || { width: customWidth || 210, height: customHeight || 297 };
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
