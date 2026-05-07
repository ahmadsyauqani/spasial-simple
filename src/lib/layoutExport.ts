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
      // THE "ABSOLUTE ZERO" ISOLATION STRATEGY REFINED
      const paper = clonedDoc.querySelector('.layout-paper');
      if (!paper) return;

      clonedDoc.querySelectorAll('#__vercel-toolbar, [data-vercel-toolbar], script').forEach(el => el.remove());

      // 1. Collect all safe CSS rules from the original document
      let safeCss = "";
      try {
        for (let i = 0; i < document.styleSheets.length; i++) {
          const sheet = document.styleSheets[i];
          try {
            const rules = sheet.cssRules || sheet.rules;
            if (rules) {
              for (let j = 0; j < rules.length; j++) {
                const ruleText = rules[j].cssText;
                if (ruleText) {
                  if (ruleText.includes("oklch(") || ruleText.includes("lab(")) {
                    safeCss += ruleText
                      .replace(/lab\([^)]+\)/g, "rgb(0,0,0)")
                      .replace(/oklch\([^)]+\)/g, "rgb(0,0,0)") + "\n";
                  } else {
                    safeCss += ruleText + "\n";
                  }
                }
              }
            }
          } catch (e) {
            // Ignore cross-origin stylesheets
          }
        }
      } catch (e) {}

      // 2. Remove all external links and style tags from clone to prevent html2canvas parsing errors
      const links = Array.from(clonedDoc.getElementsByTagName("link"));
      links.forEach(l => {
        if (l.rel === 'stylesheet') {
          l.remove();
        }
      });
      const styles = Array.from(clonedDoc.getElementsByTagName("style"));
      styles.forEach(s => s.remove());

      // 3. Inject the sanitized CSS from the original document
      if (safeCss) {
        const injectedStyle = clonedDoc.createElement('style');
        injectedStyle.innerHTML = safeCss;
        clonedDoc.head.appendChild(injectedStyle);
      }

      // 4. Inject fallback essential Tailwind classes just in case
      const fallbackStyle = clonedDoc.createElement('style');
      fallbackStyle.innerHTML = `
        .layout-paper { background: white !important; color: black !important; position: relative !important; display: block !important; margin: 0 !important; overflow: hidden !important; }
        .layout-element { position: absolute !important; }
        .bg-white { background-color: white !important; }
        .text-black { color: black !important; }
        .border { border: 1px solid #ccc !important; }
        .border-b { border-bottom: 1px solid #ccc !important; }
        .border-slate-300 { border-color: #cbd5e1 !important; }
        .border-slate-200 { border-color: #e2e8f0 !important; }
        .w-full { width: 100% !important; }
        .h-full { height: 100% !important; }
        .overflow-hidden { overflow: hidden !important; }
        .overflow-auto { overflow: auto !important; }
        .flex { display: flex !important; }
        .flex-col { flex-direction: column !important; }
        .items-center { align-items: center !important; }
        .justify-center { justify-content: center !important; }
        .justify-between { justify-content: space-between !important; }
        .gap-1 { gap: 0.25rem !important; }
        .gap-1\\.5 { gap: 0.375rem !important; }
        .gap-2 { gap: 0.5rem !important; }
        .p-2 { padding: 0.5rem !important; }
        .pb-1 { padding-bottom: 0.25rem !important; }
        .mb-1 { margin-bottom: 0.25rem !important; }
        .mt-1 { margin-top: 0.25rem !important; }
        .shrink-0 { flex-shrink: 0 !important; }
        .flex-1 { flex: 1 1 0% !important; }
        .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .leading-tight { line-height: 1.25 !important; }
        .rounded-sm { border-radius: 0.125rem !important; }
        .grid { display: grid !important; }
        .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .col-span-2 { grid-column: span 2 / span 2 !important; }
        table { border-collapse: collapse !important; width: 100% !important; }
        td, th { border: 1px solid #ccc !important; padding: 4px !important; }
        .text-center { text-align: center !important; }
        .text-left { text-align: left !important; }
        .text-right { text-align: right !important; }
        .font-bold { font-weight: bold !important; }
        .text-xs { font-size: 0.75rem !important; line-height: 1rem !important; }
        .text-sm { font-size: 0.875rem !important; line-height: 1.25rem !important; }
        .text-\\[9px\\] { font-size: 9px !important; }
        .text-\\[10px\\] { font-size: 10px !important; }
        .italic { font-style: italic !important; }
        * { color-scheme: light !important; }
      `;
      clonedDoc.head.appendChild(fallbackStyle);

      // 5. Sanitize inline styles inside paper
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
      // THE "ABSOLUTE ZERO" ISOLATION STRATEGY REFINED
      
      // 1. Give the paper a unique identifier if it doesn't have one
      const paper = clonedDoc.querySelector('.layout-paper');
      if (!paper) return;

      // 2. Remove Vercel Toolbar and other intrusive UI elements
      clonedDoc.querySelectorAll('#__vercel-toolbar, [data-vercel-toolbar], script').forEach(el => el.remove());

      // 3. Collect all safe CSS rules from the original document
      let safeCss = "";
      try {
        for (let i = 0; i < document.styleSheets.length; i++) {
          const sheet = document.styleSheets[i];
          try {
            const rules = sheet.cssRules || sheet.rules;
            if (rules) {
              for (let j = 0; j < rules.length; j++) {
                const ruleText = rules[j].cssText;
                if (ruleText) {
                  if (ruleText.includes("oklch(") || ruleText.includes("lab(")) {
                    safeCss += ruleText
                      .replace(/lab\([^)]+\)/g, "rgb(0,0,0)")
                      .replace(/oklch\([^)]+\)/g, "rgb(0,0,0)") + "\n";
                  } else {
                    safeCss += ruleText + "\n";
                  }
                }
              }
            }
          } catch (e) {
            // Ignore cross-origin stylesheets
          }
        }
      } catch (e) {}

      // 4. Remove all external links and style tags from clone to prevent html2canvas parsing errors
      const links = Array.from(clonedDoc.getElementsByTagName("link"));
      links.forEach(l => {
        if (l.rel === 'stylesheet') {
          l.remove();
        }
      });
      const styles = Array.from(clonedDoc.getElementsByTagName("style"));
      styles.forEach(s => s.remove());

      // 5. Inject the sanitized CSS from the original document
      if (safeCss) {
        const injectedStyle = clonedDoc.createElement('style');
        injectedStyle.innerHTML = safeCss;
        clonedDoc.head.appendChild(injectedStyle);
      }

      // 6. Injeksi style darurat yang SANGAT LENGKAP agar layout tetap berfungsi
      const fallbackStyle = clonedDoc.createElement('style');
      fallbackStyle.innerHTML = `
        .layout-paper { background: white !important; color: black !important; position: relative !important; display: block !important; margin: 0 !important; overflow: hidden !important; }
        .layout-element { position: absolute !important; }
        .bg-white { background-color: white !important; }
        .text-black { color: black !important; }
        .border { border: 1px solid #ccc !important; }
        .border-b { border-bottom: 1px solid #ccc !important; }
        .border-slate-300 { border-color: #cbd5e1 !important; }
        .border-slate-200 { border-color: #e2e8f0 !important; }
        .w-full { width: 100% !important; }
        .h-full { height: 100% !important; }
        .overflow-hidden { overflow: hidden !important; }
        .overflow-auto { overflow: auto !important; }
        .flex { display: flex !important; }
        .flex-col { flex-direction: column !important; }
        .items-center { align-items: center !important; }
        .justify-center { justify-content: center !important; }
        .justify-between { justify-content: space-between !important; }
        .gap-1 { gap: 0.25rem !important; }
        .gap-1\\.5 { gap: 0.375rem !important; }
        .gap-2 { gap: 0.5rem !important; }
        .p-2 { padding: 0.5rem !important; }
        .pb-1 { padding-bottom: 0.25rem !important; }
        .mb-1 { margin-bottom: 0.25rem !important; }
        .mt-1 { margin-top: 0.25rem !important; }
        .shrink-0 { flex-shrink: 0 !important; }
        .flex-1 { flex: 1 1 0% !important; }
        .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .leading-tight { line-height: 1.25 !important; }
        .rounded-sm { border-radius: 0.125rem !important; }
        .grid { display: grid !important; }
        .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .col-span-2 { grid-column: span 2 / span 2 !important; }
        table { border-collapse: collapse !important; width: 100% !important; }
        td, th { border: 1px solid #ccc !important; padding: 4px !important; }
        .text-center { text-align: center !important; }
        .text-left { text-align: left !important; }
        .text-right { text-align: right !important; }
        .font-bold { font-weight: bold !important; }
        .text-xs { font-size: 0.75rem !important; line-height: 1rem !important; }
        .text-sm { font-size: 0.875rem !important; line-height: 1.25rem !important; }
        .text-\\[9px\\] { font-size: 9px !important; }
        .text-\\[10px\\] { font-size: 10px !important; }
        .italic { font-style: italic !important; }
        * { color-scheme: light !important; }
      `;
      clonedDoc.head.appendChild(fallbackStyle);

      // 7. Sanitize all elements in the paper
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
