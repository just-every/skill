import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Hexagonal shield segment
 */
interface ShieldSegment {
  centerX: number;
  centerY: number;
  radius: number;
  angle: number;
  health: number; // 0-1
  glowPhase: number;
  vertices: Array<{ x: number; y: number }>;
}

/**
 * Pulse wave radiating from shield
 */
interface PulseWave {
  active: boolean;
  centerX: number;
  centerY: number;
  radius: number;
  maxRadius: number;
  speed: number;
  color: string;
  thickness: number;
}

/**
 * Impact particle when shield is hit
 */
interface ImpactParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

/**
 * ShieldPulse Effect - Hexagonal shield barrier with pulse waves and impact effects.
 * Mouse interaction creates impacts and spawns defensive pulse waves.
 */
export class ShieldPulse implements VisualEffect {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  // Configuration
  private speed = 1;
  private colorScheme = ['#00ccff', '#0088ff', '#00ffff', '#ffffff'];
  private density = 1;
  private enableInteraction = true;
  private segmentCount = 6;
  private shieldRadius = 250;
  private pulsePoolSize = 10;
  private particlePoolSize = 50;

  // State
  private segments: ShieldSegment[] = [];
  private pulsePool: PulseWave[] = [];
  private particlePool: ImpactParticle[] = [];
  private centerX = 0;
  private centerY = 0;
  private mouseX = -1000;
  private mouseY = -1000;
  private time = 0;
  private autoPulseTimer = 0;

  init({ canvas, ctx, width, height }: EffectInitContext): void {
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.segmentCount = Math.max(3, Math.floor(6 * this.density));

    this.centerX = width / 2;
    this.centerY = height / 2;

    this.initializeShield();
    this.initializePulsePool();
    this.initializeParticlePool();
  }

  private initializeShield(): void {
    this.segments = [];

    const angleStep = (Math.PI * 2) / this.segmentCount;

    for (let i = 0; i < this.segmentCount; i++) {
      const angle = i * angleStep;
      const segment: ShieldSegment = {
        centerX: this.centerX + Math.cos(angle) * this.shieldRadius * 0.3,
        centerY: this.centerY + Math.sin(angle) * this.shieldRadius * 0.3,
        radius: this.shieldRadius * 0.4,
        angle,
        health: 0.8 + Math.random() * 0.2,
        glowPhase: Math.random() * Math.PI * 2,
        vertices: [],
      };

      // Generate hexagon vertices
      segment.vertices = this.generateHexagonVertices(segment.centerX, segment.centerY, segment.radius, angle);

      this.segments.push(segment);
    }
  }

  private generateHexagonVertices(
    cx: number,
    cy: number,
    radius: number,
    rotation: number
  ): Array<{ x: number; y: number }> {
    const vertices: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < 6; i++) {
      const angle = rotation + (Math.PI / 3) * i;
      vertices.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    }

    return vertices;
  }

  private initializePulsePool(): void {
    this.pulsePool = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.pulsePoolSize; i++) {
      this.pulsePool.push({
        active: false,
        centerX: 0,
        centerY: 0,
        radius: 0,
        maxRadius: 300,
        speed: 100 + Math.random() * 100,
        color: colors[i % colors.length],
        thickness: 2 + Math.random() * 2,
      });
    }
  }

  private initializeParticlePool(): void {
    this.particlePool = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.particlePoolSize; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1.0,
        size: 2 + Math.random() * 3,
        color: colors[i % colors.length],
      });
    }
  }

  private spawnPulse(x: number, y: number): void {
    const pulse = this.pulsePool.find(p => !p.active);
    if (!pulse) return;

    pulse.active = true;
    pulse.centerX = x;
    pulse.centerY = y;
    pulse.radius = 0;
    pulse.maxRadius = 250 + Math.random() * 150;
    pulse.speed = (100 + Math.random() * 100) * this.speed;
  }

  private spawnImpactParticles(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const particle = this.particlePool.find(p => !p.active);
      if (!particle) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 100;

      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
      particle.life = 0;
      particle.maxLife = 0.5 + Math.random() * 0.5;
    }
  }

  render(deltaTime: number, _totalMs: number): void {
    this.time += deltaTime;

    // Clear with fade
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const speedMultiplier = this.speed;
    const dt = deltaTime * 0.001;

    // Update shield segments
    for (const segment of this.segments) {
      segment.glowPhase += dt * 3;

      // Slowly regenerate health
      if (segment.health < 1.0) {
        segment.health = Math.min(1.0, segment.health + dt * 0.1);
      }

      // Update vertices with subtle animation
      const breathe = Math.sin(this.time * 0.001 + segment.angle) * 5;
      segment.vertices = this.generateHexagonVertices(
        segment.centerX,
        segment.centerY,
        segment.radius + breathe,
        segment.angle + this.time * 0.0001
      );
    }

    // Auto-pulse
    this.autoPulseTimer += deltaTime;
    if (this.autoPulseTimer > 2000 / speedMultiplier) {
      this.spawnPulse(this.centerX, this.centerY);
      this.autoPulseTimer = 0;
    }

    // Update and draw pulses
    for (const pulse of this.pulsePool) {
      if (!pulse.active) continue;

      pulse.radius += pulse.speed * dt;

      if (pulse.radius > pulse.maxRadius) {
        pulse.active = false;
        continue;
      }

      const alpha = 1 - pulse.radius / pulse.maxRadius;

      this.ctx.strokeStyle = pulse.color;
      this.ctx.globalAlpha = alpha * 0.6;
      this.ctx.lineWidth = pulse.thickness;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = pulse.color;

      this.ctx.beginPath();
      this.ctx.arc(pulse.centerX, pulse.centerY, pulse.radius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1.0;
    }

    // Update and draw particles
    for (const particle of this.particlePool) {
      if (!particle.active) continue;

      particle.life += dt;
      if (particle.life > particle.maxLife) {
        particle.active = false;
        continue;
      }

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // Fade out
      const alpha = 1 - particle.life / particle.maxLife;

      this.ctx.fillStyle = particle.color;
      this.ctx.globalAlpha = alpha;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = particle.color;

      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1.0;
    }

    // Draw shield segments
    for (const segment of this.segments) {
      const glow = Math.sin(segment.glowPhase) * 0.3 + 0.7;
      const healthColor = segment.health > 0.5 ? this.colorScheme[0] : this.colorScheme[3];

      // Fill
      this.ctx.fillStyle = healthColor;
      this.ctx.globalAlpha = 0.15 * segment.health;

      this.ctx.beginPath();
      this.ctx.moveTo(segment.vertices[0].x, segment.vertices[0].y);
      for (let i = 1; i < segment.vertices.length; i++) {
        this.ctx.lineTo(segment.vertices[i].x, segment.vertices[i].y);
      }
      this.ctx.closePath();
      this.ctx.fill();

      // Outline
      this.ctx.strokeStyle = healthColor;
      this.ctx.globalAlpha = 0.6 * glow * segment.health;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = healthColor;
      this.ctx.stroke();

      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1.0;
    }

    // Draw central shield core
    const coreGlow = Math.sin(this.time * 0.003) * 0.3 + 0.7;
    const coreRadius = 30;

    const gradient = this.ctx.createRadialGradient(this.centerX, this.centerY, 0, this.centerX, this.centerY, coreRadius);
    gradient.addColorStop(0, this.colorScheme[0]);
    gradient.addColorStop(1, 'rgba(0, 200, 255, 0)');

    this.ctx.fillStyle = gradient;
    this.ctx.globalAlpha = coreGlow;
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = this.colorScheme[0];

    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, coreRadius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1.0;

    // Mouse proximity - draw connection line
    if (this.enableInteraction) {
      const dx = this.mouseX - this.centerX;
      const dy = this.mouseY - this.centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 400) {
        const alpha = 1 - distance / 400;

        this.ctx.strokeStyle = this.colorScheme[2];
        this.ctx.globalAlpha = alpha * 0.3;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX, this.centerY);
        this.ctx.lineTo(this.mouseX, this.mouseY);
        this.ctx.stroke();

        this.ctx.setLineDash([]);
        this.ctx.globalAlpha = 1.0;
      }
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    if (event.type === 'down' && this.enableInteraction) {
      // Spawn pulse at click location
      this.spawnPulse(event.x, event.y);

      // Spawn impact particles
      this.spawnImpactParticles(event.x, event.y, 8);

      // Damage nearby shield segment
      for (const segment of this.segments) {
        const dx = segment.centerX - event.x;
        const dy = segment.centerY - event.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < segment.radius) {
          segment.health = Math.max(0.2, segment.health - 0.15);
        }
      }
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;

    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.segmentCount = Math.max(3, Math.floor(6 * this.density));

    // Reinitialize shield at new center
    this.initializeShield();
  }

  dispose(): void {
    this.segments = [];
    this.pulsePool = [];
    this.particlePool = [];
  }
}
