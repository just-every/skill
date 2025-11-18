import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';
import { createLogoMaskSampler, LogoMaskSampler } from './utils/LogoMask';

/**
 * Diagonal wind-blown matrix rain effect.
 * Characters fall diagonally with variable wind influence,
 * creating a dynamic, weather-affected aesthetic.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  opacity: number;
  lifetime: number;
  maxLifetime: number;
  logoSignal: number;
}

const CHARSET = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_PARTICLES = 300;
const FONT_SIZE = 16;
const BASE_WIND_X = 1.5;
const BASE_WIND_Y = 2.5;
const LOGO_SAMPLE_THRESHOLD = 0.24;
const LOGO_RESPAWN_PRIORITY = 0.7;

export class DiagonalWindRain implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private particles: Particle[] = [];
  private windX = BASE_WIND_X;
  private windY = BASE_WIND_Y;
  private windPhase = 0;
  private mouseX = 0;
  private mouseY = 0;
  private pixelRatio = 1;
  private logoMask: LogoMaskSampler | null = null;
  private logoMaskLoadId = 0;
  private logoBounds = { left: 0, top: 0, width: 0, height: 0 };

  init({ ctx, width, height, pixelRatio }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio ?? 1;

    // Pre-allocate particle array
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = this.createParticle(true);
    }

    this.ctx.font = `${FONT_SIZE}px monospace`;
    this.ctx.textBaseline = 'middle';

    this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
  }

  private createParticle(initial = false): Particle {
    const maxLifetime = Math.random() * 3000 + 2000;
    const particle: Particle = {
      x: Math.random() * this.width,
      y: -FONT_SIZE,
      vx: BASE_WIND_X + (Math.random() - 0.5) * 0.5,
      vy: BASE_WIND_Y + Math.random() * 1.5,
      char: CHARSET[Math.floor(Math.random() * CHARSET.length)],
      opacity: Math.random() * 0.5 + 0.5,
      lifetime: 0,
      maxLifetime,
      logoSignal: 0,
    };

    this.resetParticle(particle, initial);
    return particle;
  }

  private updateParticle(particle: Particle, deltaMs: number): void {
    particle.lifetime += deltaMs;

    // Apply wind with sinusoidal variation
    particle.x += particle.vx * (deltaMs / 16) * this.windX;
    particle.y += particle.vy * (deltaMs / 16) * this.windY;

    // Mouse interaction - create turbulence near cursor
    const dx = particle.x - this.mouseX;
    const dy = particle.y - this.mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const influenceRadius = 150;

    if (dist < influenceRadius) {
      const force = (influenceRadius - dist) / influenceRadius;
      particle.x += (dx / dist) * force * 2;
      particle.y += (dy / dist) * force * 2;
    }

    // Fade out near end of lifetime
    const lifeFraction = particle.lifetime / particle.maxLifetime;
    if (lifeFraction > 0.7) {
      particle.opacity = (1 - lifeFraction) / 0.3;
    }

    const maskSample = this.logoMask?.sampleCanvas(particle.x, particle.y) ?? 0;
    particle.logoSignal = maskSample;
    const insideLogo = maskSample > LOGO_SAMPLE_THRESHOLD;

    if (insideLogo) {
      // Slow slightly to linger within the glyph silhouette
      particle.vx = BASE_WIND_X * 0.8 + (Math.random() - 0.5) * 0.2;
      particle.vy = BASE_WIND_Y * 0.85 + Math.random() * 0.6;
      particle.opacity = Math.min(1, particle.opacity * 0.9 + maskSample * 0.4);

      // Gentle pull toward logo center keeps diagonal shape coherent
      if (this.logoBounds.width > 0 && this.logoBounds.height > 0) {
        const targetX = this.logoBounds.left + this.logoBounds.width / 2;
        const targetY = this.logoBounds.top + this.logoBounds.height / 2;
        particle.x += (targetX - particle.x) * maskSample * 0.0025;
        particle.y += (targetY - particle.y) * maskSample * 0.0025;
      }
    }

    // Reset particle if it's off screen or expired
    if (
      particle.x < -FONT_SIZE ||
      particle.x > this.width + FONT_SIZE ||
      particle.y > this.height + FONT_SIZE ||
      particle.lifetime > particle.maxLifetime
    ) {
      this.resetParticle(particle);
    }
  }

  render(deltaMs: number, totalMs: number): void {
    if (!this.ctx) return;

    // Soft fade for trail effect
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Update wind with sinusoidal variation
    this.windPhase += deltaMs * 0.0005;
    this.windX = BASE_WIND_X + Math.sin(this.windPhase) * 0.8;
    this.windY = BASE_WIND_Y + Math.cos(this.windPhase * 0.7) * 0.3;

    // Update and render particles
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      this.updateParticle(particle, deltaMs);

      // Skip if off screen
      if (particle.x < 0 || particle.x > this.width || particle.y < 0 || particle.y > this.height) {
        continue;
      }

      // Vary color by velocity/logo signal for visual interest
      const speedFactor = Math.abs(particle.vx) / 3;
      const insideLogo = particle.logoSignal > LOGO_SAMPLE_THRESHOLD;
      const green = insideLogo
        ? Math.floor(220 + particle.logoSignal * 35)
        : Math.floor(200 + speedFactor * 55);
      const blue = insideLogo
        ? Math.floor(120 + particle.logoSignal * 120)
        : Math.floor(speedFactor * 100);

      const opacity = insideLogo
        ? Math.min(1, particle.opacity * 0.8 + particle.logoSignal * 0.4)
        : particle.opacity;

      this.ctx.fillStyle = `rgba(0, ${green}, ${blue}, ${opacity})`;
      if (insideLogo) {
        this.ctx.shadowBlur = 8 + particle.logoSignal * 6;
        this.ctx.shadowColor = `rgba(0, 255, 200, ${opacity * 0.6})`;
      } else {
        this.ctx.shadowBlur = 0;
      }

      this.ctx.fillText(particle.char, particle.x, particle.y);

      if (!insideLogo && Math.random() < 0.02) {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = `rgba(0, ${green}, ${blue}, ${particle.opacity * 0.5})`;
        this.ctx.fillText(particle.char, particle.x, particle.y);
        this.ctx.shadowBlur = 0;
      }
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;
    this.pixelRatio = size.pixelRatio ?? this.pixelRatio;

    // Reset all particles with new dimensions
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i] = this.createParticle(true);
    }

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
      .catch((error) => console.warn('[DiagonalWindRain] Failed to load logo mask', error));
  }

  private updateLogoBounds(): void {
    if (!this.logoMask) {
      this.logoBounds = { left: 0, top: 0, width: 0, height: 0 };
      return;
    }
    this.logoBounds = this.logoMask.getCanvasBounds();
  }

  private resetParticle(particle: Particle, initial = false): void {
    const spawn = this.pickSpawnPoint(initial);
    particle.x = spawn.x;
    particle.y = spawn.y;
    particle.vx = BASE_WIND_X + (Math.random() - 0.5) * 0.4;
    particle.vy = BASE_WIND_Y + Math.random() * 1.1;
    particle.char = CHARSET[Math.floor(Math.random() * CHARSET.length)];
    particle.opacity = initial ? Math.random() * 0.4 + 0.3 : Math.random() * 0.5 + 0.5;
    particle.lifetime = 0;
    particle.maxLifetime = Math.random() * 3000 + 2000;
    particle.logoSignal = spawn.signal;
  }

  private pickSpawnPoint(initial: boolean): { x: number; y: number; signal: number } {
    if (this.logoMask && Math.random() < LOGO_RESPAWN_PRIORITY) {
      const sample = this.logoMask.sampleRandomPointInLogo(LOGO_SAMPLE_THRESHOLD, 10);
      if (sample) {
        const jitterX = (Math.random() - 0.5) * FONT_SIZE * 0.8;
        const jitterY = (Math.random() - 0.5) * FONT_SIZE;
        const baseY = initial ? sample.y : sample.y - this.logoBounds.height * 0.15;
        return {
          x: Math.max(0, Math.min(this.width, sample.x + jitterX)),
          y: Math.max(-FONT_SIZE * 2, Math.min(this.height, baseY + jitterY)),
          signal: sample.intensity,
        };
      }
    }

    return {
      x: Math.random() * this.width,
      y: initial ? Math.random() * this.height : -FONT_SIZE,
      signal: 0,
    };
  }
}
