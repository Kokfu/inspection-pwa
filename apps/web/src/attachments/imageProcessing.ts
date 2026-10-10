import { formatMalaysiaDateTime } from "../uiPresentation";

const sourceSizeLimit = 20 * 1024 * 1024;
const sourcePixelLimit = 40_000_000;
const sourceDimensionLimit = 12_000;
const targetBytes = Math.floor(1.5 * 1024 * 1024);
const hardOutputLimit = 2 * 1024 * 1024;
const maxLongEdge = 1600;

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image"
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch {
      // The HTML image fallback covers browsers with partial bitmap support.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl)
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("JPEG encoding failed")),
      "image/jpeg",
      quality
    );
  });
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Photo processing was cancelled", "AbortError");
  }
}

function stampPhoto(context: CanvasRenderingContext2D, width: number, height: number, text: string) {
  const fontSize = Math.max(14, Math.round(Math.max(width, height) * 0.025));
  const padding = Math.round(fontSize * 0.4);
  const margin = Math.min(Math.round(fontSize * 0.5), width * 0.02, height * 0.02);
  context.font = `600 ${fontSize}px sans-serif`;
  const boxWidth = Math.min(context.measureText(text).width + padding * 2, width - margin * 2);
  const boxHeight = Math.min(fontSize * 1.4 + padding * 2, height - margin * 2);
  const x = width - margin - boxWidth;
  const y = height - margin - boxHeight;
  const radius = Math.min(padding, boxWidth / 2, boxHeight / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + boxWidth, y, x + boxWidth, y + boxHeight, radius);
  context.arcTo(x + boxWidth, y + boxHeight, x, y + boxHeight, radius);
  context.arcTo(x, y + boxHeight, x, y, radius);
  context.arcTo(x, y, x + boxWidth, y, radius);
  context.closePath();
  context.fillStyle = "rgba(0, 0, 0, 0.65)";
  context.fill();
  context.fillStyle = "#ffffff";
  context.textAlign = "right";
  context.textBaseline = "middle";
  context.fillText(text, width - margin - padding, y + boxHeight / 2, Math.max(1, boxWidth - padding * 2));
}

export async function processInspectionPhoto(
  sourceBlob: Blob,
  signal?: AbortSignal,
  clock: () => Date = () => new Date()
) {
  throwIfCancelled(signal);
  // Processing time for camera AND gallery. Freeze once across encoding retries.
  const stamp = formatMalaysiaDateTime(clock().toISOString())
    .replace(",", "")
    .replace(/\b(\d):/, "0$1:");
  if (sourceBlob.size <= 0 || sourceBlob.size > sourceSizeLimit) {
    throw new Error("Photo must be smaller than 20 MB before processing");
  }
  const decoded = await decodeImage(sourceBlob).catch(() => {
    throw new Error("Photo could not be decoded. Choose a valid image.");
  });
  try {
    throwIfCancelled(signal);
    if (
      decoded.width <= 0
      || decoded.height <= 0
      || decoded.width > sourceDimensionLimit
      || decoded.height > sourceDimensionLimit
      || decoded.width * decoded.height > sourcePixelLimit
    ) {
      throw new Error("Photo dimensions are outside safe processing limits");
    }

    const scale = Math.min(1, maxLongEdge / Math.max(decoded.width, decoded.height));
    let width = Math.max(1, Math.round(decoded.width * scale));
    let height = Math.max(1, Math.round(decoded.height * scale));
    let quality = 0.8;
    let result: Blob | undefined;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      try {
        throwIfCancelled(signal);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Photo processing is unavailable in this browser");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(decoded.source, 0, 0, width, height);
        // Always redraw from the original source, then stamp at output resolution.
        stampPhoto(context, width, height, stamp);
        result = await canvasBlob(canvas, quality);
        throwIfCancelled(signal);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
      if (result.size <= targetBytes) break;
      if (quality > 0.66) {
        quality -= 0.07;
      } else {
        width = Math.max(1, Math.round(width * 0.9));
        height = Math.max(1, Math.round(height * 0.9));
      }
    }

    if (!result || result.size > hardOutputLimit) {
      throw new Error("Photo could not be compressed below the safe 2 MB limit");
    }
    throwIfCancelled(signal);
    const digest = await crypto.subtle.digest("SHA-256", await result.arrayBuffer());
    throwIfCancelled(signal);
    return {
      blob: result,
      mimeType: "image/jpeg" as const,
      sizeBytes: result.size,
      width,
      height,
      sha256: hex(digest)
    };
  } finally {
    decoded.close();
  }
}

export async function requestPersistentAttachmentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist().catch(() => false);
}
