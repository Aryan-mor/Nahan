import i18next from 'i18next';

function scaleDimensions(width: number, height: number, maxSize: number) {
  if (width <= maxSize && height <= maxSize) return { width, height };
  if (width > height) {
    return { width: maxSize, height: (height / width) * maxSize };
  }
  return { width: (width / height) * maxSize, height: maxSize };
}

function ensureContext(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(i18next.t('errors.canvasInitFailed', 'Failed to initialize canvas'));
  }
  return ctx;
}

function drawImageToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  width: number,
  height: number
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = ensureContext(canvas);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

async function canvasToUint8Array(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) {
    throw new Error(i18next.t('errors.compressionFailed', 'Image compression failed'));
  }
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Resizes and converts an image to PNG format.
 * Constraints: Max 800px width/height.
 */
export const optimizeImage = async (file: File): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const { width, height } = scaleDimensions(img.width, img.height, 800);
        const canvas = drawImageToCanvas(document.createElement('canvas'), img, width, height);
        canvasToUint8Array(canvas).then(resolve).catch(reject);
      } catch (err) {
        reject(err as Error);
      } finally {
         // Only revoke after we're done drawing
         URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(i18next.t('errors.imageLoadFailed', 'Failed to load image')));
    };

    img.src = url;
  });
};

/**
 * Generates a procedural Mesh Gradient on a canvas.
 * Uses random colors and radial gradients to create an "Apple-style" mesh.
 */
export const generateMeshGradient = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = ensureContext(canvas);
  const baseHue = Math.random() * 360;
  ctx.fillStyle = `hsl(${baseHue}, 70%, 90%)`;
  ctx.fillRect(0, 0, width, height);
  const numPoints = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numPoints; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = (Math.max(width, height) / 2) * (0.8 + Math.random() * 0.5);
    const hue = (baseHue + Math.random() * 120 - 60) % 360;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.6)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
  return canvas;
};

/**
 * Converts a Blob to an ObjectURL for display.
 */
export const blobToUrl = (blob: Blob): string => {
  return URL.createObjectURL(blob);
};
