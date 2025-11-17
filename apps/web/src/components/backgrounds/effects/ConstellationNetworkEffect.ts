import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Effect 5: Constellation Network
 *
 * Visual Style: Scattered star-like points connected by thin lines when close
 * together, forming an evolving network graph. Stars twinkle subtly and the
 * network topology shifts as nodes drift slowly.
 *
 * Mouse Interaction: Mouse cursor acts as a strong attractor node that pulls
 * nearby stars toward it and creates many connections. Stars near the cursor
 * brighten and connection density increases dramatically.
 *
 * Performance Notes:
 * - Spatial grid/bucketing for connection checks (O(n) instead of O(n²))
 * - Connection distance limit keeps line count reasonable
 * - Only stars within mouse radius check for cursor attraction
 * - Limited node count (40-60 stars)
 * - Simple brightness calculations without expensive color conversions
 */

interface Star {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  brightness: number;
  targetBrightness: number;
  size: number;
  twinklePhase: number;
  gridX: number;
  gridY: number;
}

export class ConstellationNetworkEffect implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private stars: Star[] = [];
  private starCount = 50;
  private mouseX = -1000;
  private mouseY = -1000;
  private mouseActive = false;
  private gridSize = 150; // Spatial grid cell size
  private grid: Map<string, Star[]> = new Map();

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    // Create stars
    this.stars = Array.from({ length: this.starCount }, (_, index) =>
      this.createStar(index)
    );
    this.updateSpatialGrid();
  }

  private createStar(id: number): Star {
    return {
      id,
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      brightness: 0.3,
      targetBrightness: Math.random() * 0.5 + 0.3,
      size: Math.random() * 1.5 + 1,
      twinklePhase: Math.random() * Math.PI * 2,
      gridX: 0,
      gridY: 0,
    };
  }

  private getGridKey(x: number, y: number): string {
    const gx = Math.floor(x / this.gridSize);
    const gy = Math.floor(y / this.gridSize);
    return `${gx},${gy}`;
  }

  private updateSpatialGrid(): void {
    this.grid.clear();

    for (const star of this.stars) {
      const key = this.getGridKey(star.x, star.y);
      star.gridX = Math.floor(star.x / this.gridSize);
      star.gridY = Math.floor(star.y / this.gridSize);

      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key)!.push(star);
    }
  }

  private getNearbyStars(star: Star): Star[] {
    const nearby: Star[] = [];

    // Check current cell and 8 neighbors
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${star.gridX + dx},${star.gridY + dy}`;
        const cellStars = this.grid.get(key);
        if (cellStars) {
          nearby.push(...cellStars);
        }
      }
    }

    return nearby;
  }

  render(deltaMs: number, totalMs: number): void {
    if (!this.ctx) return;

    const dt = Math.min(deltaMs, 33) / 16.67;

    // Clear with slight fade
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const connectionDistance = 150;
    const mouseAttractionRadius = 250;
    const mouseConnectionDistance = 200;

    // Update stars
    for (const star of this.stars) {
      // Mouse attraction
      if (this.mouseActive) {
        const dx = this.mouseX - star.x;
        const dy = this.mouseY - star.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist < mouseAttractionRadius) {
          const force = (1 - dist / mouseAttractionRadius) * 0.05;
          star.vx += (dx / dist) * force * dt;
          star.vy += (dy / dist) * force * dt;

          // Brighten stars near mouse
          star.targetBrightness = 0.8;
        } else {
          star.targetBrightness = 0.3 + Math.random() * 0.2;
        }
      } else {
        star.targetBrightness = 0.3 + Math.random() * 0.2;
      }

      // Apply velocity
      star.x += star.vx * dt;
      star.y += star.vy * dt;

      // Damping
      star.vx *= 0.98;
      star.vy *= 0.98;

      // Wrap edges
      if (star.x < 0) star.x = this.width;
      if (star.x > this.width) star.x = 0;
      if (star.y < 0) star.y = this.height;
      if (star.y > this.height) star.y = 0;

      // Smooth brightness transition
      star.brightness += (star.targetBrightness - star.brightness) * 0.05 * dt;

      // Twinkle animation
      star.twinklePhase += 0.02 * dt;
      const twinkle = Math.sin(star.twinklePhase) * 0.1 + 0.9;
      const finalBrightness = star.brightness * twinkle;

      // Draw star
      const gradient = this.ctx.createRadialGradient(
        star.x,
        star.y,
        0,
        star.x,
        star.y,
        star.size * 2
      );
      gradient.addColorStop(0, `rgba(200, 220, 255, ${finalBrightness})`);
      gradient.addColorStop(1, `rgba(200, 220, 255, 0)`);

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Update spatial grid periodically for connection checks
    if (totalMs % 100 < deltaMs) {
      this.updateSpatialGrid();
    }

    // Draw connections between nearby stars
    this.ctx.strokeStyle = 'rgba(200, 220, 255, 0.2)';
    this.ctx.lineWidth = 0.5;

    const drawn = new Set<string>();

    for (const star of this.stars) {
      const nearbyStars = this.getNearbyStars(star);

      for (const other of nearbyStars) {
        if (star === other) continue;

        const lowId = Math.min(star.id, other.id);
        const highId = Math.max(star.id, other.id);
        const pairKey = `${lowId}-${highId}`;
        if (drawn.has(pairKey)) {
          continue;
        }

        const dx = other.x - star.x;
        const dy = other.y - star.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectionDistance) {
          const alpha = (1 - dist / connectionDistance) * 0.3;
          this.ctx.strokeStyle = `rgba(200, 220, 255, ${alpha})`;
          this.ctx.beginPath();
          this.ctx.moveTo(star.x, star.y);
          this.ctx.lineTo(other.x, other.y);
          this.ctx.stroke();

          drawn.add(pairKey);
        }
      }

      // Connections to mouse cursor when active
      if (this.mouseActive) {
        const dx = this.mouseX - star.x;
        const dy = this.mouseY - star.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < mouseConnectionDistance) {
          const alpha = (1 - dist / mouseConnectionDistance) * 0.5;
          this.ctx.strokeStyle = `rgba(150, 200, 255, ${alpha})`;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(star.x, star.y);
          this.ctx.lineTo(this.mouseX, this.mouseY);
          this.ctx.stroke();
        }
      }
    }

    // Draw mouse cursor node when active
    if (this.mouseActive) {
      const gradient = this.ctx.createRadialGradient(
        this.mouseX,
        this.mouseY,
        0,
        this.mouseX,
        this.mouseY,
        8
      );
      gradient.addColorStop(0, 'rgba(150, 200, 255, 0.8)');
      gradient.addColorStop(1, 'rgba(150, 200, 255, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(this.mouseX, this.mouseY, 8, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;
    this.mouseActive = true;

    if (event.type === 'up') {
      setTimeout(() => {
        this.mouseActive = false;
      }, 500);
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;

    // Reposition stars proportionally
    for (const star of this.stars) {
      star.x = Math.random() * this.width;
      star.y = Math.random() * this.height;
    }

    this.updateSpatialGrid();
  }

  dispose(): void {
    this.stars = [];
    this.grid.clear();
    this.ctx = null;
  }
}
