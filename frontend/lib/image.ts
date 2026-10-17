// Shrinks a phone photo before upload (plan §3.4: <=1024px, <=~500 KB) so it works on slow rural networks.

const MAX_SIDE = 1024;
const TARGET_BYTES = 500 * 1024;
const QUALITIES = [0.85, 0.75, 0.6];

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Returns a resized JPEG, or the original file if the browser can't decode it (e.g. HEIC outside Safari).
 * The server still validates whatever arrives.
 */
export async function prepareLeafPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // "from-image" applies the EXIF rotation, so photos taken in portrait stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let smallest: Blob | null = null;
  for (const q of QUALITIES) {
    const blob = await toBlob(canvas, q);
    if (!blob) break;
    smallest = blob;
    if (blob.size <= TARGET_BYTES) break;
  }
  return smallest ?? file;
}
