// Client-only: rasterise PDF pages to JPEG data URLs so they can flow through
// the same image-vision path. pdfjs is imported lazily (browser only).
export async function pdfToImages(file: File, maxPages = 5): Promise<{ name: string; dataUrl: string }[]> {
  const pdfjs = await import("pdfjs-dist");
  // The worker file is copied into /public at build time (matches the lib version).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = Math.min(pdf.numPages, maxPages);
  const out: { name: string; dataUrl: string }[] = [];

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    let scale = 2;
    let viewport = page.getViewport({ scale });
    // Keep the longest side around 2200px so the JPEG stays small but legible.
    const maxDim = Math.max(viewport.width, viewport.height);
    if (maxDim > 2200) {
      scale = (2200 / maxDim) * scale;
      viewport = page.getViewport({ scale });
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx as any, viewport, canvas } as any).promise;
    out.push({ name: `${file.name} · p${i}`, dataUrl: canvas.toDataURL("image/jpeg", 0.82) });
  }
  return out;
}
