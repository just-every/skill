import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Lock icon in the constellation
 */
interface Lock {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  state: 'locked' | 'unlocked' | 'unlocking';
  unlockProgress: number;
  color: string;
  glowPhase: number;
  rotationSpeed: number;
  rotation: number;
  connections: number[]; // Indices of connected locks
}

/**
 * Energy particle flowing between locks
 */
interface EnergyParticle {
  active: boolean;
  fromLock: number;
  toLock: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
}

/**
 * Unlock ripple effect
 */
interface UnlockRipple {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  color: string;
}

/**
 * LockConstellation Effect - Constellation of lock icons with energy flows.
 * Mouse interaction unlocks nearby locks and triggers cascade effects.
 */
export class LockConstellation implements VisualEffect {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  // Configuration
  private speed = 1;
  private colorScheme = ['#ffd700', '#ffaa00', '#ff6600', '#00ff88'];
  private density = 1;
  private enableInteraction = true;
  private lockCount = 25;
  private maxConnections = 3;
  private connectionDistance = 200;
  private particlePoolSize = 15;
  private ripplePoolSize = 10;

  // State
  private locks: Lock[] = [];
  private particlePool: EnergyParticle[] = [];
  private ripplePool: UnlockRipple[] = [];
  private mouseX = -1000;
  private mouseY = -1000;
  private mouseInfluenceRadius = 100;
  private time = 0;

  init({ canvas, ctx, width, height }: EffectInitContext): void {
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.lockCount = Math.max(10, Math.floor(25 * this.density));

    this.initializeLocks();
    this.buildConnections();
    this.initializeParticlePool();
    this.initializeRipplePool();
  }

  private initializeLocks(): void {
    this.locks = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.lockCount; i++) {
      const x = 50 + Math.random() * (this.width - 100);
      const y = 50 + Math.random() * (this.height - 100);

      this.locks.push({
        x,
        y,
        baseX: x,
        baseY: y,
        size: 20 + Math.random() * 15,
        state: Math.random() < 0.7 ? 'locked' : 'unlocked',
        unlockProgress: 0,
        color: colors[Math.floor(Math.random() * colors.length)],
        glowPhase: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.5,
        rotation: 0,
        connections: [],
      });
    }
  }

  private buildConnections(): void {
    // Clear existing connections
    for (const lock of this.locks) {
      lock.connections = [];
    }

    // Build connections based on proximity
    for (let i = 0; i < this.locks.length; i++) {
      const lock = this.locks[i];
      const distances: Array<{ index: number; distance: number }> = [];

      for (let j = 0; j < this.locks.length; j++) {
        if (i === j) continue;

        const other = this.locks[j];
        const dx = other.x - lock.x;
        const dy = other.y - lock.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.connectionDistance) {
          distances.push({ index: j, distance });
        }
      }

      // Sort by distance and connect to nearest
      distances.sort((a, b) => a.distance - b.distance);
      const connectCount = Math.min(this.maxConnections, distances.length);

      for (let k = 0; k < connectCount; k++) {
        lock.connections.push(distances[k].index);
      }
    }
  }

  private initializeParticlePool(): void {
    this.particlePool = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.particlePoolSize; i++) {
      this.particlePool.push({
        active: false,
        fromLock: 0,
        toLock: 0,
        progress: 0,
        speed: 0.2 + Math.random() * 0.3,
        color: colors[i % colors.length],
        size: 3 + Math.random() * 2,
        trail: [],
      });
    }
  }

  private initializeRipplePool(): void {
    this.ripplePool = [];

    for (let i = 0; i < this.ripplePoolSize; i++) {
      this.ripplePool.push({
        active: false,
        x: 0,
        y: 0,
        radius: 0,
        maxRadius: 80,
        speed: 120,
        color: this.colorScheme[0],
      });
    }
  }

  private spawnParticle(fromIndex: number, toIndex: number): void {
    const particle = this.particlePool.find(p => !p.active);
    if (!particle) return;

    particle.active = true;
    particle.fromLock = fromIndex;
    particle.toLock = toIndex;
    particle.progress = 0;
    particle.speed = (0.2 + Math.random() * 0.3) * this.speed;
    particle.trail = [];
  }

  private spawnRipple(x: number, y: number): void {
    const ripple = this.ripplePool.find(r => !r.active);
    if (!ripple) return;

    ripple.active = true;
    ripple.x = x;
    ripple.y = y;
    ripple.radius = 0;
    ripple.maxRadius = 60 + Math.random() * 40;
    ripple.speed = 120 * this.speed;
  }

  private drawLock(lock: Lock): void {
    this.ctx.save();
    this.ctx.translate(lock.x, lock.y);
    this.ctx.rotate(lock.rotation);

    const size = lock.size;
    const halfSize = size / 2;

    // Lock body (rectangle)
    const bodyHeight = size * 0.6;
    const bodyWidth = size * 0.8;

    this.ctx.fillStyle = lock.color;
    this.ctx.globalAlpha = lock.state === 'unlocked' ? 0.4 : 0.7;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = lock.color;

    this.ctx.fillRect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);

    // Lock shackle (arc)
    const shackleRadius = size * 0.3;
    const shackleWidth = 3;

    this.ctx.strokeStyle = lock.color;
    this.ctx.lineWidth = shackleWidth;

    if (lock.state === 'locked') {
      // Closed shackle
      this.ctx.beginPath();
      this.ctx.arc(0, -bodyHeight / 2, shackleRadius, Math.PI, 0, false);
      this.ctx.stroke();
    } else if (lock.state === 'unlocked') {
      // Open shackle
      this.ctx.beginPath();
      this.ctx.arc(shackleRadius * 0.5, -bodyHeight / 2, shackleRadius, Math.PI, 0, false);
      this.ctx.stroke();
    } else if (lock.state === 'unlocking') {
      // Animated opening
      const openAngle = lock.unlockProgress * (shackleRadius * 0.5);
      this.ctx.beginPath();
      this.ctx.arc(openAngle, -bodyHeight / 2, shackleRadius, Math.PI, 0, false);
      this.ctx.stroke();
    }

    // Keyhole
    if (lock.state === 'locked') {
      this.ctx.fillStyle = '#000';
      this.ctx.globalAlpha = 0.5;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, size * 0.15, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1.0;
    this.ctx.restore();
  }

  render(deltaTime: number, _totalMs: number): void {
    this.time += deltaTime;

    // Clear with fade
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const speedMultiplier = this.speed;
    const dt = deltaTime * 0.001;

    // Update locks
    for (let i = 0; i < this.locks.length; i++) {
      const lock = this.locks[i];

      // Update glow phase
      lock.glowPhase += dt * 2;

      // Update rotation
      lock.rotation += lock.rotationSpeed * dt;

      // Subtle drift
      const drift = Math.sin(this.time * 0.001 + i) * 2;
      lock.x = lock.baseX + drift;
      lock.y = lock.baseY + Math.cos(this.time * 0.001 + i) * 2;

      // Handle unlocking animation
      if (lock.state === 'unlocking') {
        lock.unlockProgress += dt * 2;
        if (lock.unlockProgress >= 1.0) {
          lock.state = 'unlocked';
          lock.unlockProgress = 0;

          // Spawn ripple
          this.spawnRipple(lock.x, lock.y);

          // Unlock nearby locks (cascade)
          for (const connectedIndex of lock.connections) {
            const connected = this.locks[connectedIndex];
            if (connected.state === 'locked' && Math.random() < 0.3) {
              connected.state = 'unlocking';
            }
          }
        }
      }

      // Mouse proximity unlocking
      if (this.enableInteraction && lock.state === 'locked') {
        const dx = lock.x - this.mouseX;
        const dy = lock.y - this.mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.mouseInfluenceRadius) {
          lock.state = 'unlocking';
        }
      }
    }

    // Draw connections
    this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
    this.ctx.lineWidth = 1;

    for (let i = 0; i < this.locks.length; i++) {
      const lock = this.locks[i];

      for (const connectedIndex of lock.connections) {
        const connected = this.locks[connectedIndex];

        // Brighter if both unlocked
        if (lock.state === 'unlocked' && connected.state === 'unlocked') {
          this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
        } else {
          this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
        }

        this.ctx.beginPath();
        this.ctx.moveTo(lock.x, lock.y);
        this.ctx.lineTo(connected.x, connected.y);
        this.ctx.stroke();
      }
    }

    // Update and draw particles
    for (const particle of this.particlePool) {
      if (!particle.active) continue;

      particle.progress += particle.speed * speedMultiplier * dt;

      if (particle.progress >= 1.0) {
        particle.active = false;
        continue;
      }

      const fromLock = this.locks[particle.fromLock];
      const toLock = this.locks[particle.toLock];

      const px = fromLock.x + (toLock.x - fromLock.x) * particle.progress;
      const py = fromLock.y + (toLock.y - fromLock.y) * particle.progress;

      // Add to trail
      particle.trail.push({ x: px, y: py, alpha: 1.0 });
      if (particle.trail.length > 10) {
        particle.trail.shift();
      }

      // Draw trail
      for (let i = 0; i < particle.trail.length; i++) {
        const point = particle.trail[i];
        const alpha = (i / particle.trail.length) * 0.5;

        this.ctx.fillStyle = particle.color;
        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, particle.size * (i / particle.trail.length), 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.globalAlpha = 1.0;

      // Draw particle
      this.ctx.fillStyle = particle.color;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = particle.color;
      this.ctx.beginPath();
      this.ctx.arc(px, py, particle.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    // Update and draw ripples
    for (const ripple of this.ripplePool) {
      if (!ripple.active) continue;

      ripple.radius += ripple.speed * dt;

      if (ripple.radius > ripple.maxRadius) {
        ripple.active = false;
        continue;
      }

      const alpha = 1 - ripple.radius / ripple.maxRadius;

      this.ctx.strokeStyle = ripple.color;
      this.ctx.globalAlpha = alpha * 0.6;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = ripple.color;

      this.ctx.beginPath();
      this.ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1.0;
    }

    // Draw locks
    for (const lock of this.locks) {
      this.drawLock(lock);
    }

    // Occasionally spawn particles
    if (Math.random() < 0.03 * speedMultiplier) {
      // Find two connected locks
      const fromIndex = Math.floor(Math.random() * this.locks.length);
      const fromLock = this.locks[fromIndex];

      if (fromLock.connections.length > 0) {
        const toIndex = fromLock.connections[Math.floor(Math.random() * fromLock.connections.length)];
        this.spawnParticle(fromIndex, toIndex);
      }
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    if (event.type === 'down' && this.enableInteraction) {
      for (const lock of this.locks) {
        const dx = lock.x - event.x;
        const dy = lock.y - event.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 80 && lock.state === 'locked') {
          lock.state = 'unlocking';
        }
      }

      this.spawnRipple(event.x, event.y);
    }
  }

  resize(size: EffectSize): void {
    const width = size.width;
    const height = size.height;

    const scaleX = width / this.width;
    const scaleY = height / this.height;

    for (const lock of this.locks) {
      lock.baseX *= scaleX;
      lock.baseY *= scaleY;
      lock.x = lock.baseX;
      lock.y = lock.baseY;
    }

    this.width = width;
    this.height = height;
    this.lockCount = Math.max(10, Math.floor(25 * this.density));
    this.buildConnections();
  }

  dispose(): void {
    this.locks = [];
    this.particlePool = [];
    this.ripplePool = [];
  }
}
