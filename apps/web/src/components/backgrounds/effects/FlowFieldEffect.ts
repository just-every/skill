import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Effect 3: Organic Flow Field
 *
 * Visual Style: Smooth, flowing curves that evolve over time, created by
 * particles following a Perlin-like noise field. Creates organic, wave-like
 * patterns with a hand-drawn aesthetic.
 *
 * Mouse Interaction: Mouse position influences the flow field locally,
 * creating swirls and vortices that attract nearby flow lines. The influence
 * gradually fades with distance and time.
 *
 * Performance Notes:
 * - Simplified noise function (layered sine waves) instead of true Perlin
 * - Limited particle count (80-120 particles)
 * - Low-opacity long trails avoid full canvas clears
 * - Flow field not pre-computed; calculated on-demand for affected particles only
 * - Mouse influence uses simple distance checks without complex falloff curves
 */

interface FlowParticle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  angle: number;
  speed: number;
  hue: number;
  life: number;
  maxLife: number;
}

export class FlowFieldEffect implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private particles: FlowParticle[] = [];
  private particleCount = 90;
  private mouseX = -1000;
  private mouseY = -1000;
  private mouseInfluence = 0;
  private timeOffset = 0;

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    // Initialize particles
    this.particles = Array.from({ length: this.particleCount }, () =>
      this.createParticle()
    );
  }

  private createParticle(): FlowParticle {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      prevX: 0,
      prevY: 0,
      angle: 0,
      speed: Math.random() * 0.5 + 0.3,
      hue: Math.random() * 40 + 180, // Blue-green range
      life: 0,
      maxLife: Math.random() * 200 + 100,
    };
  }

  private resetParticle(p: FlowParticle): void {
    p.x = Math.random() * this.width;
    p.y = Math.random() * this.height;
    p.prevX = p.x;
    p.prevY = p.y;
    p.speed = Math.random() * 0.5 + 0.3;
    p.hue = Math.random() * 40 + 180;
    p.life = 0;
    p.maxLife = Math.random() * 200 + 100;
  }

  // Simplified noise using layered sine waves (faster than Perlin)
  private noise(x: number, y: number, t: number): number {
    const freq1 = 0.003;
    const freq2 = 0.007;
    const freq3 = 0.013;

    const n1 = Math.sin(x * freq1 + t) * Math.cos(y * freq1);
    const n2 = Math.sin(x * freq2 - t * 0.5) * Math.cos(y * freq2);
    const n3 = Math.sin(x * freq3 + t * 0.3) * Math.cos(y * freq3 + t * 0.2);

    return (n1 + n2 * 0.5 + n3 * 0.25) / 1.75;
  }

  private getFlowAngle(x: number, y: number, t: number): number {
    const noiseVal = this.noise(x, y, t);
    let angle = noiseVal * Math.PI * 2;

    // Add mouse influence
    if (this.mouseInfluence > 0.1) {
      const dx = this.mouseX - x;
      const dy = this.mouseY - y;
      const distSq = dx * dx + dy * dy;
      const maxDistSq = 200 * 200;

      if (distSq < maxDistSq) {
        const mouseAngle = Math.atan2(dy, dx);
        const influence = (1 - distSq / maxDistSq) * this.mouseInfluence;
        angle = angle * (1 - influence) + mouseAngle * influence;
      }
    }

    return angle;
  }

  render(deltaMs: number, totalMs: number): void {
    if (!this.ctx) return;

    const dt = Math.min(deltaMs, 33) / 16.67;
    this.timeOffset = totalMs * 0.0003;

    // Subtle fade instead of full clear for trailing effect
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Decay mouse influence
    this.mouseInfluence *= 0.95;

    for (const p of this.particles) {
      p.life += dt;

      // Store previous position for line drawing
      p.prevX = p.x;
      p.prevY = p.y;

      // Get flow direction from field
      p.angle = this.getFlowAngle(p.x, p.y, this.timeOffset);

      // Update position
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;

      // Wrap around edges
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;

      // Reset particle after max life
      if (p.life > p.maxLife) {
        this.resetParticle(p);
        continue;
      }

      // Fade in/out alpha
      const lifeFactor = p.life / p.maxLife;
      let alpha = 0.4;
      if (lifeFactor < 0.1) {
        alpha *= lifeFactor / 0.1; // Fade in
      } else if (lifeFactor > 0.9) {
        alpha *= (1 - lifeFactor) / 0.1; // Fade out
      }

      // Draw flow line
      this.ctx.strokeStyle = `hsla(${p.hue}, 60%, 55%, ${alpha})`;
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(p.prevX, p.prevY);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    if (event.type === 'down' || event.type === 'move') {
      this.mouseInfluence = 0.8; // Strong influence on interaction
    } else if (event.type === 'up') {
      // Gradually fade influence after release
      setTimeout(() => {
        this.mouseInfluence = 0;
      }, 500);
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;

    // Reset all particles on resize
    for (const p of this.particles) {
      this.resetParticle(p);
    }
  }

  dispose(): void {
    this.particles = [];
    this.ctx = null;
  }
}
