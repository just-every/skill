import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

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
}

const CHARSET = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789';
const MAX_PARTICLES = 400;
const FONT_SIZE = 12;
const SPAWN_RATE = 8; // particles per frame

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

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;

    // Pre-allocate particle pool
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = this.createParticle(this.centerX, this.centerY);
    }
    this.activeCount = 0;

    this.ctx.font = `${FONT_SIZE}px monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
  }

  private createParticle(originX: number, originY: number): RadialParticle {
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
    };
  }

  private resetParticle(particle: RadialParticle, originX: number, originY: number): void {
    const angle = Math.random() * Math.PI * 2;
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
  }

  private updateParticle(particle: RadialParticle, deltaMs: number): boolean {
    particle.lifetime += deltaMs;

    // Move radially outward
    particle.distance += particle.speed * (deltaMs / 16);
    particle.x += Math.cos(particle.angle) * particle.speed * (deltaMs / 16);
    particle.y += Math.sin(particle.angle) * particle.speed * (deltaMs / 16);

    // Fade based on lifetime
    const lifeFraction = particle.lifetime / particle.maxLifetime;
    particle.opacity = 1 - lifeFraction;

    // Apply gravity for fountain effect
    particle.y += (lifeFraction * 0.3) * (deltaMs / 16);

    // Check if particle is dead
    return particle.lifetime < particle.maxLifetime && particle.opacity > 0.05;
  }

  render(deltaMs: number, _totalMs: number): void {
    if (!this.ctx) return;

    // Darker fade for more pronounced trails
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Determine spawn origin
    const originX = this.useMousePosition ? this.mouseX : this.centerX;
    const originY = this.useMousePosition ? this.mouseY : this.centerY;

    // Spawn new particles
    this.spawnAccumulator += deltaMs;
    const spawnInterval = 16; // roughly 60fps
    while (this.spawnAccumulator > spawnInterval && this.activeCount < MAX_PARTICLES) {
      this.spawnAccumulator -= spawnInterval;

      for (let i = 0; i < SPAWN_RATE && this.activeCount < MAX_PARTICLES; i++) {
        // Find first inactive particle
        let particleIndex = this.activeCount;
        this.resetParticle(this.particles[particleIndex], originX, originY);
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
        const green = Math.floor(150 + particle.hue);
        const blue = Math.floor(particle.hue * 0.5);
        this.ctx.fillStyle = `rgba(0, ${green}, ${blue}, ${particle.opacity})`;
        this.ctx.fillText(particle.char, particle.x, particle.y);

        // Occasional glow for particles near origin
        if (particle.distance < 50 && Math.random() < 0.1) {
          this.ctx.shadowBlur = 8;
          this.ctx.shadowColor = `rgba(0, ${green}, ${blue}, ${particle.opacity * 0.6})`;
          this.ctx.fillText(particle.char, particle.x, particle.y);
          this.ctx.shadowBlur = 0;
        }
      }
    }
    this.activeCount = writeIndex;

    // Draw subtle center glow
    const glowSize = 30;
    const gradient = this.ctx.createRadialGradient(originX, originY, 0, originX, originY, glowSize);
    gradient.addColorStop(0, 'rgba(0, 255, 150, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 255, 150, 0)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(originX - glowSize, originY - glowSize, glowSize * 2, glowSize * 2);
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
  }

  dispose(): void {
    this.particles = [];
    this.particlePool = [];
    this.ctx = null;
  }
}
