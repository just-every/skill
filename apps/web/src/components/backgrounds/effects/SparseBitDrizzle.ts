import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';
import { createLogoMaskSampler, LogoMaskSampler } from './utils/LogoMask';

/**
 * Sparse bit drizzle effect.
 * Minimal, sparse binary rain with occasional glitches and clusters.
 * Creates a subtle, minimalist matrix aesthetic with emphasis on negative space.
 */

interface Bit {
  x: number;
  y: number;
  value: string;
  speed: number;
  opacity: number;
  glitchTime: number;
  logoSignal: number;
}

interface Cluster {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  lifetime: number;
  maxLifetime: number;
  logoSignal: number;
}

const CHARSET = '01'; // Pure binary
const MAX_BITS = 100; // Very sparse
const MAX_CLUSTERS = 5;
const FONT_SIZE = 18;
const SPAWN_PROBABILITY = 0.02; // Low spawn rate for sparseness
const LOGO_SPAWN_PRIORITY = 0.82;
const LOGO_SAMPLE_THRESHOLD = 0.3;

export class SparseBitDrizzle implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private bits: Bit[] = [];
  private activeBits = 0;
  private clusters: Cluster[] = [];
  private activeClusters = 0;
  private mouseX = 0;
  private mouseY = 0;
  private lastSpawnTime = 0;
  private pixelRatio = 1;
  private columns = 0;
  private logoMask: LogoMaskSampler | null = null;
  private logoMaskLoadId = 0;
  private logoColumnCoverage: number[] = [];
  private logoColumnWeights: number[] = [];
  private logoColumnWeightTotal = 0;

  init({ ctx, width, height, pixelRatio }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio ?? 1;
    this.columns = Math.max(1, Math.floor(this.width / FONT_SIZE));

    // Pre-allocate bit pool
    this.bits = new Array(MAX_BITS);
    for (let i = 0; i < MAX_BITS; i++) {
      this.bits[i] = this.createBit();
    }
    this.activeBits = 0;

    // Pre-allocate cluster pool
    this.clusters = new Array(MAX_CLUSTERS);
    for (let i = 0; i < MAX_CLUSTERS; i++) {
      this.clusters[i] = this.createCluster();
    }
    this.activeClusters = 0;

    this.ctx.font = `${FONT_SIZE}px monospace`;
    this.ctx.textBaseline = 'top';

    this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
  }

  private createBit(): Bit {
    return {
      x: Math.random() * this.width,
      y: -FONT_SIZE - Math.random() * this.height,
      value: Math.random() < 0.5 ? '0' : '1',
      speed: Math.random() * 0.8 + 0.3,
      opacity: Math.random() * 0.6 + 0.4,
      glitchTime: 0,
      logoSignal: 0,
    };
  }

  private createCluster(): Cluster {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      radius: Math.random() * 100 + 50,
      intensity: Math.random() * 0.5 + 0.3,
      lifetime: 0,
      maxLifetime: Math.random() * 2000 + 1000,
      logoSignal: 0,
    };
  }

  private updateBit(bit: Bit, deltaMs: number): boolean {
    // Slow vertical movement
    const maskSample = this.logoMask?.sampleCanvas(bit.x, bit.y) ?? bit.logoSignal;
    bit.logoSignal = maskSample;
    const slowFactor = maskSample > LOGO_SAMPLE_THRESHOLD ? 1 - maskSample * 0.65 : 1;
    bit.y += (bit.speed * slowFactor * deltaMs) / 16;

    // Glitch effect - occasionally flip and jitter
    bit.glitchTime -= deltaMs;
    if (bit.glitchTime <= 0 && Math.random() < 0.02) {
      bit.value = bit.value === '0' ? '1' : '0';
      bit.glitchTime = Math.random() * 500 + 200;
    }

    // Check if bit should be recycled
    return bit.y <= this.height + FONT_SIZE;
  }

  private updateCluster(cluster: Cluster, deltaMs: number): boolean {
    cluster.lifetime += deltaMs;

    // Pulsing intensity
    const lifeFraction = cluster.lifetime / cluster.maxLifetime;
    cluster.intensity = Math.sin(lifeFraction * Math.PI) * 0.6;

    return cluster.lifetime < cluster.maxLifetime;
  }

  private spawnBit(): void {
    if (this.activeBits >= MAX_BITS) return;

    const bit = this.bits[this.activeBits];
    const spawn = this.pickLogoSpawnPoint();
    bit.x = spawn.x;
    bit.y = spawn.y;
    bit.value = Math.random() < 0.5 ? '0' : '1';
    bit.speed = Math.random() * 0.8 + 0.3;
    bit.opacity = Math.random() * 0.6 + 0.4;
    bit.glitchTime = 0;
    bit.logoSignal = spawn.signal;

    this.activeBits++;
  }

  private spawnCluster(): void {
    if (this.activeClusters >= MAX_CLUSTERS) return;

    const cluster = this.clusters[this.activeClusters];
    const spawn = this.pickLogoSpawnPoint(true);
    cluster.x = this.mouseX || spawn.x;
    cluster.y = this.mouseY || spawn.y;
    cluster.radius = Math.random() * 100 + 50;
    cluster.intensity = Math.random() * 0.5 + 0.3;
    cluster.lifetime = 0;
    cluster.maxLifetime = Math.random() * 2000 + 1000;
    cluster.logoSignal = spawn.signal;

    this.activeClusters++;
  }

  render(deltaMs: number, totalMs: number): void {
    if (!this.ctx) return;

    // Full clear for crisp, minimal aesthetic (no trails)
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Spawn bits sparingly
    this.lastSpawnTime += deltaMs;
    if (this.lastSpawnTime > 100 && Math.random() < SPAWN_PROBABILITY) {
      this.spawnBit();
      this.lastSpawnTime = 0;
    }

    // Spawn cluster occasionally
    if (Math.random() < 0.001) {
      this.spawnCluster();
    }

    // Update and render clusters (background glow)
    let writeIndex = 0;
    for (let i = 0; i < this.activeClusters; i++) {
      const cluster = this.clusters[i];
      const alive = this.updateCluster(cluster, deltaMs);

      if (alive) {
        if (writeIndex !== i) {
          this.clusters[writeIndex] = this.clusters[i];
        }
        writeIndex++;

        // Draw cluster as radial gradient
        const gradient = this.ctx.createRadialGradient(
          cluster.x,
          cluster.y,
          0,
          cluster.x,
          cluster.y,
          cluster.radius
        );
        const glowSignal = Math.max(cluster.logoSignal, this.logoMask?.sampleCanvas(cluster.x, cluster.y) ?? 0);
        gradient.addColorStop(
          0,
          `rgba(0, 255, ${120 + glowSignal * 80}, ${(cluster.intensity + glowSignal * 0.4) * 0.2})`
        );
        gradient.addColorStop(1, 'rgba(0, 255, 100, 0)');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(
          cluster.x - cluster.radius,
          cluster.y - cluster.radius,
          cluster.radius * 2,
          cluster.radius * 2
        );
      }
    }
    this.activeClusters = writeIndex;

    // Update and render bits
    writeIndex = 0;
    for (let i = 0; i < this.activeBits; i++) {
      const bit = this.bits[i];
      const alive = this.updateBit(bit, deltaMs);

      if (alive) {
        if (writeIndex !== i) {
          this.bits[writeIndex] = this.bits[i];
        }
        writeIndex++;

        // Check if bit is within any cluster for brightness boost
        let inCluster = false;
        let clusterBoost = 0;

        for (let j = 0; j < this.activeClusters; j++) {
          const cluster = this.clusters[j];
          const dx = bit.x - cluster.x;
          const dy = bit.y - cluster.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < cluster.radius) {
            inCluster = true;
            clusterBoost = Math.max(clusterBoost, (1 - dist / cluster.radius) * cluster.intensity);
          }
        }

        // Render bit
        const baseOpacity = bit.opacity;
        const logoBoost = bit.logoSignal > LOGO_SAMPLE_THRESHOLD ? bit.logoSignal * 0.55 : 0;
        const finalOpacity = Math.min(1, baseOpacity + clusterBoost + logoBoost);

        // Glitch effect - random color shift
        if (bit.glitchTime > 0) {
          const glitchIntensity = bit.glitchTime / 500;
          this.ctx.fillStyle = `rgba(${Math.floor(glitchIntensity * 100)}, 255, 100, ${finalOpacity})`;
        } else if (bit.logoSignal > LOGO_SAMPLE_THRESHOLD) {
          const cyan = 180 + Math.floor(bit.logoSignal * 70);
          this.ctx.fillStyle = `rgba(220, 255, ${cyan}, ${finalOpacity})`;
        } else if (inCluster) {
          this.ctx.fillStyle = `rgba(100, 255, 150, ${finalOpacity})`;
        } else {
          this.ctx.fillStyle = `rgba(0, 255, 70, ${finalOpacity})`;
        }

        this.ctx.fillText(bit.value, bit.x, bit.y);

        // Rare glow effect on glitching bits
        if ((bit.glitchTime > 0 || bit.logoSignal > LOGO_SAMPLE_THRESHOLD) && Math.random() < 0.3) {
          this.ctx.shadowBlur = 10;
          const glowGreen = bit.logoSignal > LOGO_SAMPLE_THRESHOLD ? 255 : 200;
          const glowBlue = bit.logoSignal > LOGO_SAMPLE_THRESHOLD ? 200 + bit.logoSignal * 80 : 100;
          this.ctx.shadowColor = `rgba(0, ${glowGreen}, ${glowBlue}, ${finalOpacity * 0.45})`;
          this.ctx.fillText(bit.value, bit.x, bit.y);
          this.ctx.shadowBlur = 0;
        }
      }
    }
    this.activeBits = writeIndex;
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    // Spawn cluster on click
    if (event.type === 'down') {
      this.spawnCluster();
    }

    // Spawn bits near mouse on movement
    if (event.type === 'move' && Math.random() < 0.3 && this.activeBits < MAX_BITS) {
      const bit = this.bits[this.activeBits];
      bit.x = event.x + (Math.random() - 0.5) * 50;
      bit.y = event.y + (Math.random() - 0.5) * 50;
      bit.value = Math.random() < 0.5 ? '0' : '1';
      bit.speed = Math.random() * 0.8 + 0.3;
      bit.opacity = Math.random() * 0.6 + 0.4;
      bit.glitchTime = Math.random() * 200;
      bit.logoSignal = this.logoMask?.sampleCanvas(bit.x, bit.y) ?? 0;
      this.activeBits++;
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;
    this.pixelRatio = size.pixelRatio ?? this.pixelRatio;
    this.columns = Math.max(1, Math.floor(this.width / FONT_SIZE));

    // Reset all bits
    this.activeBits = 0;
    this.activeClusters = 0;

    if (this.logoMask) {
      this.logoMask.updateViewport({
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
      });
      this.recomputeLogoColumnCoverage();
    } else {
      this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
    }
  }

  dispose(): void {
    this.bits = [];
    this.clusters = [];
    this.ctx = null;
    this.logoMask = null;
  }

  private ensureLogoMask(size: EffectSize): void {
    const loadId = ++this.logoMaskLoadId;
    void createLogoMaskSampler({
      width: size.width,
      height: size.height,
      pixelRatio: size.pixelRatio,
    })
      .then((sampler) => {
        if (loadId !== this.logoMaskLoadId) return;
        this.logoMask = sampler;
        this.recomputeLogoColumnCoverage();
      })
      .catch((error) => console.warn('[SparseBitDrizzle] Failed to load logo mask', error));
  }

  private recomputeLogoColumnCoverage(): void {
    if (!this.logoMask || this.columns <= 0) {
      this.logoColumnCoverage = [];
      this.logoColumnWeights = [];
      this.logoColumnWeightTotal = 0;
      return;
    }

    const coverage: number[] = new Array(this.columns).fill(0);
    const weights: number[] = new Array(this.columns).fill(0);
    let total = 0;

    for (let column = 0; column < this.columns; column++) {
      const columnX = column * FONT_SIZE;
      const density = this.logoMask.sampleColumnDensity(columnX, FONT_SIZE, 8);
      coverage[column] = density;
      const weight = density * 0.95 + 0.02;
      weights[column] = weight;
      total += weight;
    }

    this.logoColumnCoverage = coverage;
    this.logoColumnWeights = weights;
    this.logoColumnWeightTotal = total;
  }

  private pickLogoSpawnPoint(forceFullHeight = false): { x: number; y: number; signal: number } {
    if (
      !this.logoMask ||
      !this.logoColumnWeights.length ||
      this.logoColumnWeightTotal === 0 ||
      (forceFullHeight === false && Math.random() > LOGO_SPAWN_PRIORITY)
    ) {
      return { x: Math.random() * this.width, y: -FONT_SIZE, signal: 0 };
    }

    let target = Math.random() * this.logoColumnWeightTotal;
    let columnIndex = 0;
    for (; columnIndex < this.logoColumnWeights.length; columnIndex++) {
      target -= this.logoColumnWeights[columnIndex];
      if (target <= 0) {
        break;
      }
    }
    const x = columnIndex * FONT_SIZE + (Math.random() - 0.5) * FONT_SIZE;
    const sample = this.logoMask.sampleRandomPointInLogo(LOGO_SAMPLE_THRESHOLD, 6);
    const y = sample
      ? sample.y - (forceFullHeight ? 0 : FONT_SIZE * 0.3)
      : forceFullHeight
        ? Math.random() * this.height
        : -FONT_SIZE;
    const signal = sample?.intensity ?? this.logoColumnCoverage[columnIndex] ?? 0;
    return {
      x: Math.max(0, Math.min(this.width, x)),
      y,
      signal,
    };
  }
}
