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
      // THE "ABSOLUTE ZERO" ISOLATION STRATEGY
      const paper = clonedDoc.querySelector('.layout-paper');
      if (!paper) return;

      clonedDoc.querySelectorAll('#__vercel-toolbar, [data-vercel-toolbar], script').forEach(el => el.remove());

      const styles = Array.from(clonedDoc.getElementsByTagName("style"));
      const links = Array.from(clonedDoc.getElementsByTagName("link"));

      styles.forEach(s => {
        if (s.innerHTML.includes("lab(") || s.innerHTML.includes("oklch(")) {
          s.innerHTML = s.innerHTML
            .replace(/lab\([^)]+\)/g, "rgb(0,0,0)")
            .replace(/oklch\([^)]+\)/g, "rgb(0,0,0)");
        }
      });

      links.forEach(l => {
        if (l.rel === 'stylesheet' && (l.href.includes('_next') || l.href.includes('vercel'))) {
          l.remove();
        }
      });

      const style = clonedDoc.createElement('style');
      style.innerHTML = `
        .layout-paper { background: white !important; color: black !important; position: relative !important; display: block !important; margin: 0 !important; }
        .layout-element { position: absolute !important; }
        .bg-white { background-color: white !important; }
        .text-black { color: black !important; }
        .border { border: 1px solid #ccc !important; }
        .w-full { width: 100% !important; }
        .h-full { height: 100% !important; }
        table { border-collapse: collapse !important; width: 100% !important; }
        td { border: 1px solid #eee !important; padding: 2px !important; }
        .text-center { text-align: center !important; }
        .font-bold { font-weight: bold !important; }
        * { color-scheme: light !important; color: black; }
      `;
      clonedDoc.head.appendChild(style);

      paper.querySelectorAll("*").forEach((el: any) => {
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
      // THE "ABSOLUTE ZERO" ISOLATION STRATEGY
      
      // 1. Give the paper a unique identifier if it doesn't have one
      const paper = clonedDoc.querySelector('.layout-paper');
      if (!paper) return;

      // 2. Remove Vercel Toolbar and other intrusive UI elements
      clonedDoc.querySelectorAll('#__vercel-toolbar, [data-vercel-toolbar], script').forEach(el => el.remove());

      // 3. NUCLEAR: Remove all link tags and style tags that are not essential
      // We keep styles that DON'T contain lab/oklch
      const styles = Array.from(clonedDoc.getElementsByTagName("style"));
      const links = Array.from(clonedDoc.getElementsByTagName("link"));

      styles.forEach(s => {
        if (s.innerHTML.includes("lab(") || s.innerHTML.includes("oklch(")) {
          // If it has problematic colors, sanitize it aggressively
          s.innerHTML = s.innerHTML
            .replace(/lab\([^)]+\)/g, "rgb(0,0,0)")
            .replace(/oklch\([^)]+\)/g, "rgb(0,0,0)");
        }
      });

      links.forEach(l => {
        if (l.rel === 'stylesheet' && (l.href.includes('_next') || l.href.includes('vercel'))) {
          // These are the most likely sources. We REMOVE them.
          l.remove();
        }
      });

      // 4. Injeksi style darurat yang SANGAT LENGKAP agar layout tetap berfungsi
      const style = clonedDoc.createElement('style');
      style.innerHTML = `
        .layout-paper { background: white !important; color: black !important; position: relative !important; display: block !important; margin: 0 !important; }
        .layout-element { position: absolute !important; }
        .bg-white { background-color: white !important; }
        .text-black { color: black !important; }
        .border { border: 1px solid #ccc !important; }
        .w-full { width: 100% !important; }
        .h-full { height: 100% !important; }
        table { border-collapse: collapse !important; width: 100% !important; }
        td { border: 1px solid #eee !important; padding: 2px !important; }
        .text-center { text-align: center !important; }
        .font-bold { font-weight: bold !important; }
        /* Reset any inherit lab() colors */
        * { color-scheme: light !important; color: black; }
      `;
      clonedDoc.head.appendChild(style);

      // 5. Sanitize all elements in the paper
      paper.querySelectorAll("*").forEach((el: any) => {
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
