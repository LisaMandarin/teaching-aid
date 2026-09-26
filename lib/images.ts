// Shrinking images in the browser: used by the games' uploads and by the image resizer tool.

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("無法讀取圖片"));
    };
    img.src = url;
  });
}

// Draws the image so its longest side is at most `maxSide` pixels (never enlarged).
export function drawScaled(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Keep PNG/GIF transparency; everything else compresses better as JPEG.
export const keepsTransparency = (type: string) => type === "image/png" || type === "image/gif";

// Formats the resizer can write back out. Lessons find images by file name, so a file
// keeps its own format (and extension); others (GIF, HEIC, …) are left as they are.
const LOSSY = ["image/jpeg", "image/webp"];
export const canShrink = (type: string) => type === "image/png" || LOSSY.includes(type);

export type Shrunk = {
  blob: Blob; // the original file when it couldn't be made smaller
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  changed: boolean;
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("無法轉換圖片"))), type, quality),
  );

// Scales down to `maxSide`, then lowers JPEG/WebP quality step by step until the file is
// under `targetBytes`. PNG has no quality setting, so it may still end up larger.
export async function shrinkImage(file: File, maxSide: number, targetBytes: number): Promise<Shrunk> {
  const img = await loadImage(file);
  const original: Shrunk = {
    blob: file,
    width: img.naturalWidth,
    height: img.naturalHeight,
    originalWidth: img.naturalWidth,
    originalHeight: img.naturalHeight,
    changed: false,
  };
  const small = Math.max(img.naturalWidth, img.naturalHeight) <= maxSide && file.size <= targetBytes;
  if (small || !canShrink(file.type)) return original;

  const canvas = drawScaled(img, maxSide);
  let blob = await toBlob(canvas, file.type, 0.85);
  if (LOSSY.includes(file.type)) {
    for (const quality of [0.75, 0.65, 0.55]) {
      if (blob.size <= targetBytes) break;
      blob = await toBlob(canvas, file.type, quality);
    }
  }
  if (blob.size >= file.size) return original;
  return { ...original, blob, width: canvas.width, height: canvas.height, changed: true };
}
