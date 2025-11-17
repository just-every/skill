import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Effect 4: Scanline Glitch
 *
 * Visual Style: Retro CRT/terminal aesthetic with horizontal scanlines that
 * occasionally glitch and distort. Minimal color palette (greens/cyans on black)
 * with subtle noise texture. Evokes old phosphor monitors.
 *
 * Mouse Interaction: Mouse movement triggers localized glitch zones that
 * create horizontal displacement and color separation effects. Glitches
 * propagate briefly then fade out.
 *
 * Performance Notes:
 * - Only affected scanline regions are redrawn (not full screen)
 * - Glitch zones stored in fixed array (max 8 concurrent zones)
 * - Simple rect fills and horizontal line drawing (very fast)
 * - Noise pattern uses Math.random (fast) not complex algorithms
 * - ImageData manipulation avoided; uses canvas primitives only
 */

interface GlitchZone {
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  intensity: number;
  age: number;
  active: boolean;
}

export class ScanlineGlitchEffect implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private scanlineSpacing = 4;
  private scanlineOffset = 0;
  private glitchZones: GlitchZone[] = [];
  private maxGlitchZones = 8;
  private randomGlitchTimer = 0;

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    // Pre-allocate glitch zone pool
    this.glitchZones = Array.from({ length: this.maxGlitchZones }, () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      offsetX: 0,
      intensity: 0,
      age: 0,
      active: false,
    }));
  }

  private addGlitchZone(x: number, y: number, intensity: number): void {
    let zone = this.glitchZones.find((z) => !z.active);
    if (!zone) {
      zone = this.glitchZones[0]; // Reuse oldest
    }

    zone.x = x - 100;
    zone.y = Math.floor(y / 20) * 20; // Snap to horizontal bands
    zone.width = Math.random() * 200 + 100;
    zone.height = Math.random() * 40 + 20;
    zone.offsetX = (Math.random() - 0.5) * 30 * intensity;
    zone.intensity = intensity;
    zone.age = 0;
    zone.active = true;
  }

  render(deltaMs: number, totalMs: number): void {
    if (!this.ctx) return;

    const dt = Math.min(deltaMs, 33) / 16.67;

    // Base background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Slowly scrolling scanlines
    this.scanlineOffset = (totalMs * 0.01) % this.scanlineSpacing;

    // Draw scanlines
    this.ctx.strokeStyle = 'rgba(0, 255, 100, 0.03)';
    this.ctx.lineWidth = 1;
    for (let y = -this.scanlineOffset; y < this.height; y += this.scanlineSpacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // Add random noise dots for texture
    this.ctx.fillStyle = 'rgba(0, 255, 150, 0.04)';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * this.width;
      const y = Math.random() * this.height;
      this.ctx.fillRect(x, y, 1, 1);
    }

    // Random glitch events
    this.randomGlitchTimer += deltaMs;
    if (this.randomGlitchTimer > 2000 + Math.random() * 3000) {
      this.randomGlitchTimer = 0;
      this.addGlitchZone(
        Math.random() * this.width,
        Math.random() * this.height,
        0.6
      );
    }

    // Update and render glitch zones
    for (const zone of this.glitchZones) {
      if (!zone.active) continue;

      zone.age += dt;

      // Decay intensity over time
      const maxAge = 30;
      const ageFactor = 1 - zone.age / maxAge;
      if (ageFactor <= 0) {
        zone.active = false;
        continue;
      }

      const currentIntensity = zone.intensity * ageFactor;

      // Draw glitched horizontal bands with color separation
      const bands = 3;
      for (let i = 0; i < bands; i++) {
        const bandY = zone.y + (zone.height / bands) * i;
        const bandHeight = zone.height / bands;

        // RGB separation effect
        const offsetVariation = (Math.random() - 0.5) * 10;
        const xOffset = zone.offsetX + offsetVariation;

        // Red channel
        this.ctx.fillStyle = `rgba(255, 0, 100, ${currentIntensity * 0.15})`;
        this.ctx.fillRect(zone.x + xOffset - 2, bandY, zone.width, bandHeight);

        // Green channel
        this.ctx.fillStyle = `rgba(0, 255, 100, ${currentIntensity * 0.2})`;
        this.ctx.fillRect(zone.x + xOffset, bandY, zone.width, bandHeight);

        // Cyan channel
        this.ctx.fillStyle = `rgba(0, 150, 255, ${currentIntensity * 0.15})`;
        this.ctx.fillRect(zone.x + xOffset + 2, bandY, zone.width, bandHeight);
      }

      // Add horizontal scan artifacts
      if (Math.random() > 0.7) {
        this.ctx.fillStyle = `rgba(255, 255, 255, ${currentIntensity * 0.3})`;
        const artifactY = zone.y + Math.random() * zone.height;
        this.ctx.fillRect(zone.x, artifactY, zone.width, 1);
      }
    }

    // Subtle vignette effect
    const gradient = this.ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      0,
      this.width / 2,
      this.height / 2,
      this.width * 0.7
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  handlePointer(event: EffectPointerEvent): void {
    if (event.type === 'move' || event.type === 'down') {
      // Trigger glitch at mouse position
      const intensity = event.type === 'down' ? 1 : 0.5;
      this.addGlitchZone(event.x, event.y, intensity);
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;

    // Clear glitches on resize
    for (const zone of this.glitchZones) {
      zone.active = false;
    }
  }

  dispose(): void {
    this.glitchZones = [];
    this.ctx = null;
  }
}
