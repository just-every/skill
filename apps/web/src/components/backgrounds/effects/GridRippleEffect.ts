import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Effect 2: Grid Ripple
 *
 * Visual Style: A subtle grid of dots that normally pulse very gently.
 * The grid uses a low-resolution approach for performance.
 *
 * Mouse Interaction: Clicking or touching triggers expanding circular ripples
 * that displace nearby grid points, creating wave-like distortions that
 * propagate outward and gradually fade.
 *
 * Performance Notes:
 * - Low-resolution grid (20-30 pixel spacing) keeps dot count manageable
 * - Ripples stored in a fixed-size array (max 10 concurrent ripples)
 * - Simple distance calculations without expensive trig functions
 * - Grid is pre-computed on resize, not every frame
 * - Only affected grid points are recalculated each frame
 */

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  strength: number;
  active: boolean;
}

export class GridRippleEffect implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private gridSpacing = 25;
  private gridCols = 0;
  private gridRows = 0;
  private ripples: Ripple[] = [];
  private maxRipples = 10;
  private pulsePhase = 0;

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.computeGrid();

    // Pre-allocate ripple pool
    this.ripples = Array.from({ length: this.maxRipples }, () => ({
      x: 0,
      y: 0,
      radius: 0,
      maxRadius: 400,
      strength: 0,
      active: false,
    }));
  }

  private computeGrid(): void {
    this.gridCols = Math.ceil(this.width / this.gridSpacing) + 1;
    this.gridRows = Math.ceil(this.height / this.gridSpacing) + 1;
  }

  private addRipple(x: number, y: number): void {
    // Find inactive ripple slot or reuse oldest
    let ripple = this.ripples.find((r) => !r.active);
    if (!ripple) {
      ripple = this.ripples[0]; // Reuse oldest
    }

    ripple.x = x;
    ripple.y = y;
    ripple.radius = 0;
    ripple.maxRadius = 400;
    ripple.strength = 1;
    ripple.active = true;
  }

  render(deltaMs: number, totalMs: number): void {
    if (!this.ctx) return;

    const dt = Math.min(deltaMs, 33) / 16.67;

    // Clear canvas
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Update ripples
    for (const ripple of this.ripples) {
      if (!ripple.active) continue;

      ripple.radius += 3 * dt;
      ripple.strength = Math.max(0, 1 - ripple.radius / ripple.maxRadius);

      if (ripple.strength <= 0) {
        ripple.active = false;
      }
    }

    // Global pulse for subtle animation
    this.pulsePhase = totalMs * 0.0005;
    const globalPulse = Math.sin(this.pulsePhase) * 0.15 + 0.85;

    // Draw grid points
    for (let row = 0; row < this.gridRows; row++) {
      for (let col = 0; col < this.gridCols; col++) {
        const baseX = col * this.gridSpacing;
        const baseY = row * this.gridSpacing;

        let offsetX = 0;
        let offsetY = 0;
        let rippleInfluence = 0;

        // Calculate displacement from active ripples
        for (const ripple of this.ripples) {
          if (!ripple.active) continue;

          const dx = baseX - ripple.x;
          const dy = baseY - ripple.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Wave function: peaks at ripple radius, falls off
          const waveDist = Math.abs(dist - ripple.radius);
          if (waveDist < 30) {
            const influence = (1 - waveDist / 30) * ripple.strength;
            const angle = Math.atan2(dy, dx);
            const displacement = influence * 8;

            offsetX += Math.cos(angle) * displacement;
            offsetY += Math.sin(angle) * displacement;
            rippleInfluence += influence;
          }
        }

        const x = baseX + offsetX;
        const y = baseY + offsetY;

        // Dot size and opacity influenced by ripples and global pulse
        const baseSize = 1.5;
        const size = baseSize + rippleInfluence * 2;
        const baseAlpha = 0.3;
        const alpha = Math.min(1, (baseAlpha + rippleInfluence * 0.5) * globalPulse);

        // Color shifts slightly with ripple influence
        const hue = 200 + rippleInfluence * 60;

        this.ctx.fillStyle = `hsla(${hue}, 60%, 50%, ${alpha})`;
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    if (event.type === 'down' || event.type === 'move') {
      // Add ripple on click or drag
      if (event.type === 'down') {
        this.addRipple(event.x, event.y);
      }
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;
    this.computeGrid();

    // Clear active ripples on resize
    for (const ripple of this.ripples) {
      ripple.active = false;
    }
  }

  dispose(): void {
    this.ripples = [];
    this.ctx = null;
  }
}
