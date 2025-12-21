/**
 * PDF Thumbnail Generator
 * Uses PDF.js to render the first page of a PDF as a thumbnail
 */

import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/**
 * Generate a thumbnail from PDF data
 * @param {string} inputData - Base64 encoded PDF data or binary data
 * @param {number} maxSize - Maximum width/height of thumbnail (default 200)
 * @returns {Promise<string>} Data URL of the rendered thumbnail (PNG)
 */
export async function generatePdfThumbnail(inputData, maxSize = 200) {
  let bytes;

  // Handle various input types
  if (typeof inputData === "string") {
    // Base64 string
    const binaryString = atob(inputData);
    bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
  } else if (inputData instanceof Uint8Array) {
    bytes = inputData;
  } else if (inputData instanceof ArrayBuffer) {
    bytes = new Uint8Array(inputData);
  } else {
    throw new Error("Invalid input data type for PDF generation");
  }

  // Load PDF document
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  return renderPdfPageToDataUrl(pdf, maxSize);
}

/**
 * Render first page of a PDF document to a data URL
 * @param {PDFDocumentProxy} pdf - Loaded PDF document
 * @param {number} maxSize - Maximum width/height of thumbnail
 * @returns {Promise<string>} Data URL of the rendered thumbnail (PNG)
 */
async function renderPdfPageToDataUrl(pdf, maxSize) {
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });

  // Calculate scale to fit within maxSize while maintaining aspect ratio
  const scale = maxSize / Math.max(viewport.width, viewport.height);
  const scaledViewport = page.getViewport({ scale });

  // Create canvas and render
  const canvas = document.createElement("canvas");
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  const ctx = canvas.getContext("2d");

  await page.render({
    canvasContext: ctx,
    viewport: scaledViewport,
  }).promise;

  return canvas.toDataURL("image/png");
}

/**
 * Generate a thumbnail from a PDF URL (including blob: URLs)
 * @param {string} url - URL to PDF file
 * @param {number} maxSize - Maximum width/height of thumbnail (default 200)
 * @returns {Promise<string>} Data URL of the rendered thumbnail (PNG)
 */
export async function generatePdfThumbnailFromUrl(url, maxSize = 200) {
  const loadingTask = pdfjsLib.getDocument(url);
  const pdf = await loadingTask.promise;
  return renderPdfPageToDataUrl(pdf, maxSize);
}
