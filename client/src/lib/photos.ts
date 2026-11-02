/**
 * Client-side preparation of product photos before upload: type, size and dimension checks,
 * and downscaling of very large camera images so uploads stay fast without losing the
 * detail retailers need to judge fabric, weave and embroidery.
 */
export const PHOTO_RULES = {
  types: ['image/jpeg', 'image/png', 'image/webp'],
  /** Raw files above this are refused before any processing (phone panoramas, scans). */
  maxInputBytes: 25 * 1024 * 1024,
  /** Server limit per file. */
  maxUploadBytes: 8 * 1024 * 1024,
  minSide: 400,
  /** Longest side kept after resizing — enough for close-up garment detail. */
  maxSide: 2560,
  /** Files already within maxSide and under this size are uploaded untouched. */
  keepOriginalBelowBytes: 3 * 1024 * 1024,
  quality: 0.9,
} as const;

export interface PreparedPhoto {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  /** True when the photo was downscaled/re-encoded on this device. */
  resized: boolean;
  source: 'camera' | 'device';
}

async function decode(blob: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if ('createImageBitmap' in window) {
    // imageOrientation keeps phone photos upright (EXIF rotation).
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, quality));

/** Validates and (if needed) resizes one photo. Throws an Error with a supplier-friendly message. */
export async function preparePhoto(input: File | Blob, source: PreparedPhoto['source'], name = 'camera-photo.jpg'): Promise<PreparedPhoto> {
  const fileName = input instanceof File ? input.name : name;
  if (!PHOTO_RULES.types.includes(input.type as (typeof PHOTO_RULES.types)[number])) {
    throw new Error(`"${fileName}" is not a JPEG, PNG or WebP photo${/heic|heif/i.test(input.type || fileName) ? ' (iPhone HEIC photos: choose "Most Compatible" in Camera settings, or take the photo here)' : ''}.`);
  }
  if (input.size > PHOTO_RULES.maxInputBytes) throw new Error(`"${fileName}" is larger than 25 MB.`);
  let img;
  try {
    img = await decode(input);
  } catch {
    throw new Error(`"${fileName}" could not be opened as an image.`);
  }
  try {
    const { width, height } = img;
    if (Math.min(width, height) < PHOTO_RULES.minSide) {
      throw new Error(`"${fileName}" is only ${width}×${height}px. Use a photo at least ${PHOTO_RULES.minSide}px on its shortest side so garment details are clear.`);
    }
    const needsResize = Math.max(width, height) > PHOTO_RULES.maxSide || input.size > PHOTO_RULES.keepOriginalBelowBytes;
    let out: Blob = input;
    let w = width;
    let h = height;
    if (needsResize) {
      const scale = Math.min(1, PHOTO_RULES.maxSide / Math.max(width, height));
      w = Math.round(width * scale);
      h = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; // flatten transparent PNGs onto white
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
      img.draw(ctx, w, h);
      out = await toBlob(canvas, 'image/jpeg', PHOTO_RULES.quality);
    }
    if (out.size > PHOTO_RULES.maxUploadBytes) throw new Error(`"${fileName}" is still larger than 8 MB after resizing.`);
    const finalName = needsResize ? fileName.replace(/\.[a-z0-9]+$/i, '') + '.jpg' : fileName;
    const file = new File([out], finalName, { type: out.type || input.type });
    return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), width: w, height: h, resized: needsResize, source };
  } finally {
    img.close();
  }
}

/** Live camera support needs a secure context (https or localhost) and the MediaDevices API. */
export function liveCameraSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}
