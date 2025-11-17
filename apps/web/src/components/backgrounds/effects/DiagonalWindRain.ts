import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

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
}

const CHARSET = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_PARTICLES = 300;
const FONT_SIZE = 16;
const BASE_WIND_X = 1.5;
const BASE_WIND_Y = 2.5;

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

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    // Pre-allocate particle array
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = this.createParticle();
    }

    this.ctx.font = `${FONT_SIZE}px monospace`;
    this.ctx.textBaseline = 'middle';
  }

  private createParticle(): Particle {
    const maxLifetime = Math.random() * 3000 + 2000;
    return {
      x: Math.random() * this.width,
      y: -FONT_SIZE,
      vx: BASE_WIND_X + (Math.random() - 0.5) * 0.5,
      vy: BASE_WIND_Y + Math.random() * 1.5,
      char: CHARSET[Math.floor(Math.random() * CHARSET.length)],
      opacity: Math.random() * 0.5 + 0.5,
      lifetime: 0,
      maxLifetime,
    };
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

    // Reset particle if it's off screen or expired
    if (
      particle.x < -FONT_SIZE ||
      particle.x > this.width + FONT_SIZE ||
      particle.y > this.height + FONT_SIZE ||
      particle.lifetime > particle.maxLifetime
    ) {
      const newParticle = this.createParticle();
      particle.x = newParticle.x;
      particle.y = newParticle.y;
      particle.vx = newParticle.vx;
      particle.vy = newParticle.vy;
      particle.char = newParticle.char;
      particle.opacity = newParticle.opacity;
      particle.lifetime = 0;
      particle.maxLifetime = newParticle.maxLifetime;
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

      // Vary color by velocity for visual interest
      const speedFactor = Math.abs(particle.vx) / 3;
      const green = Math.floor(200 + speedFactor * 55);
      const blue = Math.floor(speedFactor * 100);

      this.ctx.fillStyle = `rgba(0, ${green}, ${blue}, ${particle.opacity})`;
      this.ctx.fillText(particle.char, particle.x, particle.y);

      // Add occasional glow effect for visual pop
      if (Math.random() < 0.02) {
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

    // Reset all particles with new dimensions
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i] = this.createParticle();
    }
  }

  dispose(): void {
    this.particles = [];
    this.ctx = null;
  }
}
