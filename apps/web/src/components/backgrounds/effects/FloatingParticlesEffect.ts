import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Effect 1: Floating Particles
 *
 * Visual Style: Sparse field of small, slowly drifting particles that gently
 * float upward and drift sideways. Particles fade in/out smoothly.
 *
 * Mouse Interaction: Particles are attracted to the cursor position, creating
 * a subtle gathering effect. The attraction strength falls off with distance.
 *
 * Performance Notes:
 * - Limited particle count (50-100 particles)
 * - Simple circular shapes (arc drawing is fast)
 * - Minimal per-particle state (position, velocity, alpha)
 * - No complex math operations in the hot path
 * - Pooled particle array allocated once in init()
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  targetAlpha: number;
  size: number;
  hue: number;
}

export class FloatingParticlesEffect implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private particles: Particle[] = [];
  private mouseX = -1000;
  private mouseY = -1000;
  private particleCount = 60;

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    // Pre-allocate particle pool
    this.particles = Array.from({ length: this.particleCount }, () =>
      this.createParticle()
    );
  }

  private createParticle(): Particle {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.5 - 0.2, // Slight upward drift
      alpha: 0,
      targetAlpha: Math.random() * 0.4 + 0.1,
      size: Math.random() * 2 + 1,
      hue: Math.random() * 60 + 200, // Blue-cyan range
    };
  }

  private resetParticle(p: Particle): void {
    p.x = Math.random() * this.width;
    p.y = this.height + 20; // Spawn below viewport
    p.vx = (Math.random() - 0.5) * 0.3;
    p.vy = -Math.random() * 0.5 - 0.2;
    p.alpha = 0;
    p.targetAlpha = Math.random() * 0.4 + 0.1;
    p.size = Math.random() * 2 + 1;
    p.hue = Math.random() * 60 + 200;
  }

  render(deltaMs: number, _totalMs: number): void {
    if (!this.ctx) return;

    const dt = Math.min(deltaMs, 33) / 16.67; // Normalize to ~60fps

    // Clear with slight fade for motion blur effect
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Mouse attraction strength (inverse square falloff)
    const attractionStrength = 0.02;
    const maxAttractionDist = 300;

    for (const p of this.particles) {
      // Mouse attraction force
      if (this.mouseX > -500) {
        const dx = this.mouseX - p.x;
        const dy = this.mouseY - p.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist < maxAttractionDist && dist > 1) {
          const force = attractionStrength * (1 - dist / maxAttractionDist);
          p.vx += (dx / dist) * force * dt;
          p.vy += (dy / dist) * force * dt;
        }
      }

      // Apply velocity with damping
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;

      // Smooth alpha transition
      p.alpha += (p.targetAlpha - p.alpha) * 0.05 * dt;

      // Wrap/reset particles that leave the viewport
      if (p.y < -20 || p.x < -20 || p.x > this.width + 20) {
        this.resetParticle(p);
      }

      // Draw particle
      this.ctx.fillStyle = `hsla(${p.hue}, 70%, 60%, ${p.alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    // Clear mouse position after inactivity
    if (event.type === 'up') {
      setTimeout(() => {
        this.mouseX = -1000;
        this.mouseY = -1000;
      }, 1000);
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;

    // Reposition particles proportionally
    for (const p of this.particles) {
      p.x = Math.random() * this.width;
      p.y = Math.random() * this.height;
    }
  }

  dispose(): void {
    this.particles = [];
    this.ctx = null;
  }
}
