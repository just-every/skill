import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';
import { createLogoMaskSampler, LogoMaskSampler } from './utils/LogoMask';

/**
 * Radial fountain matrix effect.
 * Characters emanate from the center (or mouse position) in a radial burst pattern,
 * creating a fountain or explosion aesthetic.
 */

interface RadialParticle {
  x: number;
  y: number;
  angle: number;
  speed: number;
  distance: number;
  char: string;
  opacity: number;
  hue: number;
  lifetime: number;
  maxLifetime: number;
  logoSignal: number;
}

const CHARSET = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789';
const MAX_PARTICLES = 400;
const FONT_SIZE = 12;
const SPAWN_RATE = 8; // particles per frame
const LOGO_SAMPLE_THRESHOLD = 0.26;
const LOGO_SPAWN_PRIORITY = 0.75;

export class RadialFountain implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private centerX = 0;
  private centerY = 0;
  private particles: RadialParticle[] = [];
  private particlePool: RadialParticle[] = [];
  private activeCount = 0;
  private mouseX = 0;
  private mouseY = 0;
  private useMousePosition = false;
  private spawnAccumulator = 0;
  private pixelRatio = 1;
  private logoMask: LogoMaskSampler | null = null;
  private logoMaskLoadId = 0;
  private logoBounds = { left: 0, top: 0, width: 0, height: 0 };

  init({ ctx, width, height, pixelRatio }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio ?? 1;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;

    // Pre-allocate particle pool
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = this.createParticle(this.centerX, this.centerY, true);
    }
    this.activeCount = 0;

    this.ctx.font = `${FONT_SIZE}px monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
  }

  private createParticle(originX: number, originY: number, initial = false): RadialParticle {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 1.5 + 0.5;
    const maxLifetime = Math.random() * 2000 + 1500;

    return {
      x: originX,
      y: originY,
      angle,
      speed,
      distance: 0,
      char: CHARSET[Math.floor(Math.random() * CHARSET.length)],
      opacity: 1,
      hue: Math.random() * 60 + 80, // Green-cyan range
      lifetime: 0,
      maxLifetime,
      logoSignal: 0,
    };
  }

  private resetParticle(
    particle: RadialParticle,
    originX: number,
    originY: number,
    forcedAngle?: number,
    initial = false
  ): void {
    const angle = forcedAngle ?? Math.random() * Math.PI * 2;
    const speed = Math.random() * 1.5 + 0.5;
    const maxLifetime = Math.random() * 2000 + 1500;

    particle.x = originX;
    particle.y = originY;
    particle.angle = angle;
    particle.speed = speed;
    particle.distance = 0;
    particle.char = CHARSET[Math.floor(Math.random() * CHARSET.length)];
    particle.opacity = 1;
    particle.hue = Math.random() * 60 + 80;
    particle.lifetime = 0;
    particle.maxLifetime = maxLifetime;
    particle.logoSignal = 0;
  }

  private updateParticle(particle: RadialParticle, deltaMs: number): boolean {
    particle.lifetime += deltaMs;

    // Move radially outward
    const motionScale = deltaMs / 16;
    particle.distance += particle.speed * motionScale;
    particle.x += Math.cos(particle.angle) * particle.speed * motionScale;
    particle.y += Math.sin(particle.angle) * particle.speed * motionScale;

    // Fade based on lifetime
    const lifeFraction = particle.lifetime / particle.maxLifetime;
    particle.opacity = 1 - lifeFraction;

    // Apply gravity for fountain effect
    particle.y += (lifeFraction * 0.3) * motionScale;

    const maskSample = this.logoMask?.sampleCanvas(particle.x, particle.y) ?? 0;
    particle.logoSignal = maskSample;
    if (maskSample > LOGO_SAMPLE_THRESHOLD) {
      // Slow particles as they pass through the logo to linger on strokes
      particle.speed *= 1 - maskSample * 0.25;
    }

    // Check if particle is dead
    return particle.lifetime < particle.maxLifetime && particle.opacity > 0.05;
  }

  render(deltaMs: number, _totalMs: number): void {
    if (!this.ctx) return;

    // Darker fade for more pronounced trails
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Determine spawn origin
    const origin = this.pickSpawnOrigin();
    const originX = this.useMousePosition ? this.mouseX : origin.x;
    const originY = this.useMousePosition ? this.mouseY : origin.y;

    // Spawn new particles
    this.spawnAccumulator += deltaMs;
    const spawnInterval = 16; // roughly 60fps
    while (this.spawnAccumulator > spawnInterval && this.activeCount < MAX_PARTICLES) {
      this.spawnAccumulator -= spawnInterval;

      for (let i = 0; i < SPAWN_RATE && this.activeCount < MAX_PARTICLES; i++) {
        // Find first inactive particle
        let particleIndex = this.activeCount;
        const angle = this.pickSpawnAngle(originX, originY, origin.logoCenterAngle);
        this.resetParticle(this.particles[particleIndex], originX, originY, angle, true);
        this.activeCount++;
      }
    }

    // Update and render active particles
    let writeIndex = 0;
    for (let i = 0; i < this.activeCount; i++) {
      const particle = this.particles[i];
      const alive = this.updateParticle(particle, deltaMs);

      if (alive) {
        // Keep particle (compact array)
        if (writeIndex !== i) {
          this.particles[writeIndex] = this.particles[i];
        }
        writeIndex++;

        // Render particle
        const maskSample = particle.logoSignal;
        const insideLogo = maskSample > LOGO_SAMPLE_THRESHOLD;
        if (insideLogo) {
          const boostedOpacity = Math.min(1, particle.opacity * 0.85 + maskSample * 0.45);
          const green = Math.floor(160 + maskSample * 90);
          const blue = Math.floor(110 + maskSample * 120);
          this.ctx.fillStyle = `rgba(60, ${green}, ${blue}, ${boostedOpacity})`;
          if (Math.random() < 0.2) {
            this.ctx.shadowBlur = 12 * maskSample;
            this.ctx.shadowColor = `rgba(0, 255, 200, ${maskSample * 0.35})`;
          } else {
            this.ctx.shadowBlur = 0;
          }
        } else {
          const green = Math.floor(150 + particle.hue);
          const blue = Math.floor(particle.hue * 0.5);
          this.ctx.fillStyle = `rgba(0, ${green}, ${blue}, ${particle.opacity})`;
          if (particle.distance < 50 && Math.random() < 0.1) {
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = `rgba(0, ${green}, ${blue}, ${particle.opacity * 0.6})`;
          } else {
            this.ctx.shadowBlur = 0;
          }
        }

        this.ctx.fillText(particle.char, particle.x, particle.y);
      }
    }
    this.activeCount = writeIndex;

    // Draw subtle center glow
    const glowAnchor = this.logoMask && !this.useMousePosition ? this.getLogoCenter() : { x: originX, y: originY };
    const glowSize = 40;
    const gradient = this.ctx.createRadialGradient(
      glowAnchor.x,
      glowAnchor.y,
      0,
      glowAnchor.x,
      glowAnchor.y,
      glowSize
    );
    gradient.addColorStop(0, 'rgba(0, 255, 180, 0.18)');
    gradient.addColorStop(1, 'rgba(0, 255, 180, 0)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(glowAnchor.x - glowSize, glowAnchor.y - glowSize, glowSize * 2, glowSize * 2);
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    // Enable mouse position mode on pointer down
    if (event.type === 'down') {
      this.useMousePosition = true;
    } else if (event.type === 'up') {
      this.useMousePosition = false;
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.pixelRatio = size.pixelRatio ?? this.pixelRatio;

    if (this.logoMask) {
      this.logoMask.updateViewport({
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
      });
      this.updateLogoBounds();
    } else {
      this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
    }
  }

  dispose(): void {
    this.particles = [];
    this.particlePool = [];
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
        this.updateLogoBounds();
      })
      .catch((error) => console.warn('[RadialFountain] Failed to load logo mask', error));
  }

  private updateLogoBounds(): void {
    if (!this.logoMask) {
      this.logoBounds = { left: 0, top: 0, width: 0, height: 0 };
      return;
    }
    this.logoBounds = this.logoMask.getCanvasBounds();
  }

  private pickSpawnOrigin(): { x: number; y: number; logoCenterAngle: number | null } {
    if (!this.logoMask || Math.random() > LOGO_SPAWN_PRIORITY) {
      return { x: this.centerX, y: this.centerY, logoCenterAngle: null };
    }

    const sample = this.logoMask.sampleRandomPointInLogo(LOGO_SAMPLE_THRESHOLD, 10);
    if (!sample) {
      return { x: this.centerX, y: this.centerY, logoCenterAngle: null };
    }

    return {
      x: sample.x,
      y: sample.y,
      logoCenterAngle: Math.atan2(sample.y - this.centerY, sample.x - this.centerX),
    };
  }

  private pickSpawnAngle(originX: number, originY: number, preferredAngle: number | null): number {
    if (!this.logoMask || preferredAngle == null) {
      return Math.random() * Math.PI * 2;
    }

    const jitter = (Math.random() - 0.5) * (Math.PI / 2);
    return preferredAngle + jitter;
  }

  private getLogoCenter(): { x: number; y: number } {
    if (!this.logoMask) {
      return { x: this.centerX, y: this.centerY };
    }
    return {
      x: this.logoBounds.left + this.logoBounds.width / 2,
      y: this.logoBounds.top + this.logoBounds.height / 2,
    };
  }
}
