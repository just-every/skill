import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

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
}

interface Cluster {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  lifetime: number;
  maxLifetime: number;
}

const CHARSET = '01'; // Pure binary
const MAX_BITS = 100; // Very sparse
const MAX_CLUSTERS = 5;
const FONT_SIZE = 18;
const SPAWN_PROBABILITY = 0.02; // Low spawn rate for sparseness

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

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

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
  }

  private createBit(): Bit {
    return {
      x: Math.random() * this.width,
      y: -FONT_SIZE - Math.random() * this.height,
      value: Math.random() < 0.5 ? '0' : '1',
      speed: Math.random() * 0.8 + 0.3,
      opacity: Math.random() * 0.6 + 0.4,
      glitchTime: 0,
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
    };
  }

  private updateBit(bit: Bit, deltaMs: number): boolean {
    // Slow vertical movement
    bit.y += (bit.speed * deltaMs) / 16;

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
    bit.x = Math.random() * this.width;
    bit.y = -FONT_SIZE;
    bit.value = Math.random() < 0.5 ? '0' : '1';
    bit.speed = Math.random() * 0.8 + 0.3;
    bit.opacity = Math.random() * 0.6 + 0.4;
    bit.glitchTime = 0;

    this.activeBits++;
  }

  private spawnCluster(): void {
    if (this.activeClusters >= MAX_CLUSTERS) return;

    const cluster = this.clusters[this.activeClusters];
    cluster.x = this.mouseX || Math.random() * this.width;
    cluster.y = this.mouseY || Math.random() * this.height;
    cluster.radius = Math.random() * 100 + 50;
    cluster.intensity = Math.random() * 0.5 + 0.3;
    cluster.lifetime = 0;
    cluster.maxLifetime = Math.random() * 2000 + 1000;

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
        gradient.addColorStop(0, `rgba(0, 255, 100, ${cluster.intensity * 0.2})`);
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
        const finalOpacity = Math.min(1, baseOpacity + clusterBoost);

        // Glitch effect - random color shift
        if (bit.glitchTime > 0) {
          const glitchIntensity = bit.glitchTime / 500;
          this.ctx.fillStyle = `rgba(${Math.floor(glitchIntensity * 100)}, 255, 100, ${finalOpacity})`;
        } else if (inCluster) {
          this.ctx.fillStyle = `rgba(100, 255, 150, ${finalOpacity})`;
        } else {
          this.ctx.fillStyle = `rgba(0, 255, 70, ${finalOpacity})`;
        }

        this.ctx.fillText(bit.value, bit.x, bit.y);

        // Rare glow effect on glitching bits
        if (bit.glitchTime > 0 && Math.random() < 0.3) {
          this.ctx.shadowBlur = 10;
          this.ctx.shadowColor = `rgba(0, 255, 100, ${finalOpacity * 0.5})`;
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
      this.activeBits++;
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;

    // Reset all bits
    this.activeBits = 0;
    this.activeClusters = 0;
  }

  dispose(): void {
    this.bits = [];
    this.clusters = [];
    this.ctx = null;
  }
}
