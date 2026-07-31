async function createLocalOcrWorker(onProgress: (message: string) => void) {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr",
    logger: (event) => {
      if (event.status === "loading tesseract core") onProgress("Starting the local reader…");
      else if (event.status === "loading language traineddata") onProgress("Loading the text reader…");
      else if (event.status === "initializing api") onProgress("Almost ready…");
      else if (event.status === "recognizing text") onProgress(`Reading timetable… ${Math.round((event.progress || 0) * 100)}%`);
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
  return worker;
}

async function preparePhotoForOcr(file: File) {
  const bitmap = await createImageBitmap(file);
  const longestSide = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, 2200 / longestSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not prepare the photo.");
  }
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = "grayscale(1) contrast(1.18)";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function extractScheduleFile(file: File, onProgress: (message: string) => void) {
  if (file.type.startsWith("image/")) {
    onProgress("Optimizing the photo…");
    const canvas = await preparePhotoForOcr(file);
    const worker = await createLocalOcrWorker(onProgress);
    try {
      const result = await worker.recognize(canvas);
      return result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a JPG, PNG, HEIC, WEBP, or PDF file.");

  onProgress("Reading the PDF…");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > 8) {
    await loadingTask.destroy();
    throw new Error("Choose a timetable PDF with 8 pages or fewer.");
  }

  try {
    const pageLines: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Reading PDF page ${pageNumber} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const entries = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }];
      }).sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
      const rows: Array<{ y: number; cells: Array<{ x: number; text: string }> }> = [];
      entries.forEach((entry) => {
        const row = rows.find((candidate) => Math.abs(candidate.y - entry.y) <= 3);
        if (row) row.cells.push({ x: entry.x, text: entry.text });
        else rows.push({ y: entry.y, cells: [{ x: entry.x, text: entry.text }] });
      });
      pageLines.push(rows.sort((a, b) => b.y - a.y).map((row) => row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(" ")).join("\n"));
    }

    const embeddedText = pageLines.join("\n").trim();
    if (embeddedText.length >= 60) return embeddedText;

    onProgress("This PDF is scanned. Reading it as an image…");
    const worker = await createLocalOcrWorker(onProgress);
    try {
      const scannedPages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("This browser could not prepare the PDF page.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        onProgress(`Reading scanned page ${pageNumber} of ${pdf.numPages}…`);
        const result = await worker.recognize(canvas);
        scannedPages.push(result.data.text.trim());
      }
      return scannedPages.join("\n").trim();
    } finally {
      await worker.terminate();
    }
  } finally {
    await loadingTask.destroy();
  }
}
