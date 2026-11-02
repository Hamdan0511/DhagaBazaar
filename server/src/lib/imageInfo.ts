/**
 * Reads pixel dimensions from JPEG, PNG and WebP headers without decoding the image.
 * Returns null when the header is malformed, which callers treat as an invalid upload.
 */
export function imageDimensions(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === 'image/png') {
      // Signature (8) + IHDR length/type (8), then width and height as big-endian uint32.
      if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
      return valid(buf.readUInt32BE(16), buf.readUInt32BE(20));
    }
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        // Padding bytes and markers without a length field.
        if (marker === 0xff) {
          i += 1;
          continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const len = buf.readUInt16BE(i + 2);
        // SOF0–SOF15 carry the frame size (excluding DHT, JPG and DAC markers).
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return valid(buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5));
        }
        i += 2 + len;
      }
      return null;
    }
    if (mime === 'image/webp') {
      if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') return valid(buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff);
      if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return valid((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1);
      }
      if (chunk === 'VP8X') return valid(buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1);
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

function valid(width: number, height: number) {
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Product photo limits: big enough to show garment detail, small enough to serve. */
export const PRODUCT_IMAGE_LIMITS = { minSide: 400, maxSide: 8000 } as const;

export function productImageProblem(name: string, dims: { width: number; height: number } | null): string | null {
  if (!dims) return `"${name}" could not be read as an image.`;
  const { width, height } = dims;
  if (Math.min(width, height) < PRODUCT_IMAGE_LIMITS.minSide) {
    return `"${name}" is ${width}×${height}px. Photos must be at least ${PRODUCT_IMAGE_LIMITS.minSide}px on the shortest side so garment details are clear.`;
  }
  if (Math.max(width, height) > PRODUCT_IMAGE_LIMITS.maxSide) return `"${name}" is larger than ${PRODUCT_IMAGE_LIMITS.maxSide}px. Please use a smaller photo.`;
  return null;
}
