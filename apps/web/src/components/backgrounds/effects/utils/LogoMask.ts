import type { EffectSize } from '../types';

type LogoMaskBaseData = {
  readonly width: number;
  readonly height: number;
  readonly intensities: Float32Array;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
};

export type LogoMaskViewport = Pick<EffectSize, 'width' | 'height' | 'pixelRatio'> & {
  readonly coverage?: number;
  readonly verticalOffset?: number;
};

const LOGO_ASSET_PATH = '/img/code-splash-black.png';
const LOGO_BASE_WIDTH = 640;
const LOGO_ALPHA_THRESHOLD = 0.12;
const LOGO_INSIDE_THRESHOLD = 0.3;

let baseDataPromise: Promise<LogoMaskBaseData> | null = null;

const hasDOM = typeof document !== 'undefined' && typeof window !== 'undefined';

const getCanvasContext = (width: number, height: number): CanvasRenderingContext2D | null => {
  if (!hasDOM) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: true });
};

const loadLogoImage = async (): Promise<HTMLImageElement | null> => {
  if (!hasDOM) return null;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = (error) => reject(error);
    image.src = LOGO_ASSET_PATH;
  }).catch(() => null);
};

const getImageDataFromImage = (image: HTMLImageElement | null): ImageData | null => {
  if (!image) return null;

  const naturalWidth = image.naturalWidth || LOGO_BASE_WIDTH;
  const naturalHeight = image.naturalHeight || Math.round(LOGO_BASE_WIDTH * 0.42);
  const scaledWidth = Math.min(LOGO_BASE_WIDTH, naturalWidth);
  const scale = naturalWidth > 0 ? scaledWidth / naturalWidth : 1;
  const scaledHeight = Math.max(1, Math.round(naturalHeight * scale));
  const ctx = getCanvasContext(scaledWidth, scaledHeight);
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, scaledWidth, scaledHeight);
  return ctx.getImageData(0, 0, scaledWidth, scaledHeight);
};

const createFallbackImageData = (width = LOGO_BASE_WIDTH, height = Math.round(LOGO_BASE_WIDTH * 0.4)): ImageData | null => {
  const ctx = getCanvasContext(width, height);
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const fontSize = Math.floor(height * 0.72);
  ctx.font = `700 ${fontSize}px "Space Grotesk", "Inter", "Segoe UI", sans-serif`;
  ctx.fillText('CODE', width / 2, height / 2);
  return ctx.getImageData(0, 0, width, height);
};

const buildMaskData = (imageData: ImageData | null): LogoMaskBaseData | null => {
  if (!imageData) return null;

  const { data, width, height } = imageData;
  const intensities = new Float32Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let active = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3] / 255;
      const luminance =
        (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255;

      let intensity = 0;
      if (alpha > LOGO_ALPHA_THRESHOLD) {
        const colorSignal = Math.abs(0.5 - luminance) * 2; // amplify both bright and dark
        intensity = Math.min(1, alpha * 0.8 + colorSignal * 0.7);
      }

      intensities[y * width + x] = intensity;

      if (intensity > LOGO_ALPHA_THRESHOLD) {
        active++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const coverage = active / intensities.length;
  if (active === 0 || coverage > 0.6) {
    return null;
  }

  return {
    width,
    height,
    intensities,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
    },
  };
};

const ensureBaseData = async (): Promise<LogoMaskBaseData> => {
  if (!hasDOM) {
    throw new Error('Logo mask requires a browser environment.');
  }

  if (!baseDataPromise) {
    baseDataPromise = (async () => {
      const logoImage = await loadLogoImage();
      const dataFromImage = buildMaskData(getImageDataFromImage(logoImage));
      if (dataFromImage) {
        return dataFromImage;
      }

      const fallbackData = buildMaskData(createFallbackImageData());
      if (!fallbackData) {
        throw new Error('Unable to construct fallback logo mask.');
      }
      return fallbackData;
    })();
  }

  return baseDataPromise;
};

type Transform = {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly drawWidth: number;
  readonly drawHeight: number;
};

export class LogoMaskSampler {
  private viewport: LogoMaskViewport;
  private transform: Transform;

  constructor(private readonly base: LogoMaskBaseData, viewport: LogoMaskViewport) {
    this.viewport = viewport;
    this.transform = this.computeTransform(viewport);
  }

  updateViewport(viewport: LogoMaskViewport): void {
    this.viewport = viewport;
    this.transform = this.computeTransform(viewport);
  }

  sampleCanvas(x: number, y: number): number {
    const localX = (x - this.transform.offsetX) * this.transform.scaleX;
    const localY = (y - this.transform.offsetY) * this.transform.scaleY;

    if (localX < 0 || localY < 0 || localX >= this.base.width || localY >= this.base.height) {
      return 0;
    }

    const idx = Math.floor(localY) * this.base.width + Math.floor(localX);
    return this.base.intensities[idx];
  }

  sampleNormalized(nx: number, ny: number): number {
    if (!this.viewport.width || !this.viewport.height) return 0;
    return this.sampleCanvas(nx * this.viewport.width, ny * this.viewport.height);
  }

  isInsideCanvas(x: number, y: number, threshold = LOGO_INSIDE_THRESHOLD): boolean {
    return this.sampleCanvas(x, y) >= threshold;
  }

  isInsideNormalized(nx: number, ny: number, threshold = LOGO_INSIDE_THRESHOLD): boolean {
    return this.sampleNormalized(nx, ny) >= threshold;
  }

  sampleColumnDensity(columnX: number, columnWidth: number, samples = 8): number {
    if (samples <= 0) return 0;
    let total = 0;
    const centerX = columnX + columnWidth / 2;
    for (let i = 0; i < samples; i++) {
      const sampleY = ((i + 0.5) / samples) * this.viewport.height;
      total += this.sampleCanvas(centerX, sampleY);
    }
    return total / samples;
  }

  getCanvasBounds(): { left: number; top: number; width: number; height: number } {
    const widthScale = this.transform.drawWidth / this.base.width;
    const heightScale = this.transform.drawHeight / this.base.height;
    const left = this.transform.offsetX + this.base.bounds.minX * widthScale;
    const top = this.transform.offsetY + this.base.bounds.minY * heightScale;
    const width = Math.max(0, (this.base.bounds.maxX - this.base.bounds.minX) * widthScale);
    const height = Math.max(0, (this.base.bounds.maxY - this.base.bounds.minY) * heightScale);

    return { left, top, width, height };
  }

  getNormalizedBounds(): { left: number; top: number; width: number; height: number } {
    const { width, height } = this.viewport;
    if (!width || !height) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    const canvasBounds = this.getCanvasBounds();
    return {
      left: canvasBounds.left / width,
      top: canvasBounds.top / height,
      width: canvasBounds.width / width,
      height: canvasBounds.height / height,
    };
  }

  sampleRandomPointInLogo(
    threshold = LOGO_INSIDE_THRESHOLD,
    attempts = 8
  ): { x: number; y: number; intensity: number } | null {
    if (!this.viewport.width || !this.viewport.height) return null;

    const bounds = this.getCanvasBounds();
    if (!bounds.width || !bounds.height) return null;

    let best: { x: number; y: number; intensity: number } | null = null;
    for (let i = 0; i < attempts; i++) {
      const sampleX = bounds.left + Math.random() * bounds.width;
      const sampleY = bounds.top + Math.random() * bounds.height;
      const intensity = this.sampleCanvas(sampleX, sampleY);
      if (intensity > threshold) {
        return { x: sampleX, y: sampleY, intensity };
      }
      if (!best || intensity > best.intensity) {
        best = { x: sampleX, y: sampleY, intensity };
      }
    }

    return best;
  }

  private computeTransform(viewport: LogoMaskViewport): Transform {
    const { width, height } = viewport;
    if (!width || !height) {
      return {
        offsetX: 0,
        offsetY: 0,
        scaleX: 1,
        scaleY: 1,
        drawWidth: this.base.width,
        drawHeight: this.base.height,
      };
    }

    const coverage = viewport.coverage ?? 0.78;
    const baseAspect = this.base.width / this.base.height;
    const maxWidth = width * coverage;
    const maxHeight = height * (coverage * 0.8);

    let drawWidth = maxWidth;
    let drawHeight = drawWidth / baseAspect;

    if (drawHeight > maxHeight) {
      drawHeight = maxHeight;
      drawWidth = drawHeight * baseAspect;
    }

    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2 + (viewport.verticalOffset ?? 0);

    return {
      offsetX,
      offsetY,
      scaleX: this.base.width / drawWidth,
      scaleY: this.base.height / drawHeight,
      drawWidth,
      drawHeight,
    };
  }
}

export const createLogoMaskSampler = async (
  viewport: LogoMaskViewport
): Promise<LogoMaskSampler> => {
  const base = await ensureBaseData();
  return new LogoMaskSampler(base, viewport);
};

export const releaseLogoMaskCache = (): void => {
  baseDataPromise = null;
};
