import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Waveform layer representing encryption/decryption
 */
interface WaveformLayer {
  points: Array<{ x: number; y: number; vy: number }>;
  baseY: number;
  frequency: number;
  amplitude: number;
  phase: number;
  speed: number;
  color: string;
  encrypted: boolean;
  scrambleProgress: number;
}

/**
 * Data bit particle flowing through waveform
 */
interface DataBit {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  size: number;
  color: string;
  encrypted: boolean;
  transformProgress: number;
}

/**
 * Encryption burst effect
 */
interface EncryptionBurst {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  type: 'encrypt' | 'decrypt';
}

/**
 * EncryptionWaveform Effect - Flowing waveforms representing data encryption.
 * Mouse interaction triggers encryption/decryption bursts and scrambles waveforms.
 */
export class EncryptionWaveform implements VisualEffect {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  // Configuration
  private speed = 1;
  private colorScheme = ['#00ff00', '#00ff88', '#ff00ff', '#ffff00'];
  private density = 1;
  private enableInteraction = true;
  private layerCount = 5;
  private pointsPerLayer = 100;
  private bitPoolSize = 30;
  private burstPoolSize = 10;

  // State
  private layers: WaveformLayer[] = [];
  private bitPool: DataBit[] = [];
  private burstPool: EncryptionBurst[] = [];
  private mouseX = -1000;
  private mouseY = -1000;
  private mouseInfluenceRadius = 150;
  private time = 0;

  init({ canvas, ctx, width, height }: EffectInitContext): void {
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.layerCount = Math.max(3, Math.floor(5 * this.density));

    this.initializeLayers();
    this.initializeBitPool();
    this.initializeBurstPool();
  }

  private initializeLayers(): void {
    this.layers = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.layerCount; i++) {
      const baseY = ((i + 1) / (this.layerCount + 1)) * this.height;
      const points: Array<{ x: number; y: number; vy: number }> = [];

      for (let j = 0; j <= this.pointsPerLayer; j++) {
        const x = (j / this.pointsPerLayer) * this.width;
        points.push({
          x,
          y: baseY,
          vy: 0,
        });
      }

      this.layers.push({
        points,
        baseY,
        frequency: 0.01 + i * 0.005,
        amplitude: 30 + Math.random() * 40,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.5,
        color: colors[i % colors.length],
        encrypted: Math.random() < 0.5,
        scrambleProgress: 0,
      });
    }
  }

  private initializeBitPool(): void {
    this.bitPool = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.bitPoolSize; i++) {
      this.bitPool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 100 + Math.random() * 100,
        size: 3 + Math.random() * 3,
        color: colors[i % colors.length],
        encrypted: false,
        transformProgress: 0,
      });
    }
  }

  private initializeBurstPool(): void {
    this.burstPool = [];

    for (let i = 0; i < this.burstPoolSize; i++) {
      this.burstPool.push({
        active: false,
        x: 0,
        y: 0,
        radius: 0,
        maxRadius: 100,
        speed: 150,
        type: 'encrypt',
      });
    }
  }

  private spawnBit(layerIndex: number): void {
    const bit = this.bitPool.find(b => !b.active);
    if (!bit || layerIndex >= this.layers.length) return;

    const layer = this.layers[layerIndex];

    bit.active = true;
    bit.x = 0;
    bit.y = layer.baseY;
    bit.vx = (100 + Math.random() * 100) * this.speed;
    bit.encrypted = layer.encrypted;
    bit.transformProgress = 0;
  }

  private spawnBurst(x: number, y: number, type: 'encrypt' | 'decrypt'): void {
    const burst = this.burstPool.find(b => !b.active);
    if (!burst) return;

    burst.active = true;
    burst.x = x;
    burst.y = y;
    burst.radius = 0;
    burst.maxRadius = 100 + Math.random() * 50;
    burst.speed = 150 * this.speed;
    burst.type = type;
  }

  render(deltaTime: number, _totalMs: number): void {
    this.time += deltaTime;

    // Clear with fade
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const speedMultiplier = this.speed;
    const dt = deltaTime * 0.001;

    // Update and draw bursts first (behind waveforms)
    for (const burst of this.burstPool) {
      if (!burst.active) continue;

      burst.radius += burst.speed * dt;

      if (burst.radius > burst.maxRadius) {
        burst.active = false;
        continue;
      }

      // Affect nearby layers
      for (const layer of this.layers) {
        const dy = Math.abs(layer.baseY - burst.y);

        if (dy < burst.radius) {
          if (burst.type === 'encrypt' && !layer.encrypted) {
            layer.encrypted = true;
            layer.scrambleProgress = 0;
          } else if (burst.type === 'decrypt' && layer.encrypted) {
            layer.encrypted = false;
            layer.scrambleProgress = 0;
          }
        }
      }

      const alpha = 1 - burst.radius / burst.maxRadius;
      const color = burst.type === 'encrypt' ? '#ff00ff' : '#00ff88';

      this.ctx.strokeStyle = color;
      this.ctx.globalAlpha = alpha * 0.4;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = color;

      this.ctx.beginPath();
      this.ctx.arc(burst.x, burst.y, burst.radius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1.0;
    }

    // Update and draw waveform layers
    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex++) {
      const layer = this.layers[layerIndex];

      // Update phase
      layer.phase += layer.speed * speedMultiplier * dt;

      // Update scramble progress
      if (layer.scrambleProgress < 1.0) {
        layer.scrambleProgress = Math.min(1.0, layer.scrambleProgress + dt * 0.5);
      }

      // Update points
      for (let i = 0; i < layer.points.length; i++) {
        const point = layer.points[i];
        const normalizedX = point.x / this.width;

        if (layer.encrypted) {
          // Encrypted - chaotic, scrambled waveform
          const scramble = Math.sin(this.time * 0.003 * (i + 1)) * layer.amplitude * 0.5;
          const noise = (Math.random() - 0.5) * 20 * layer.scrambleProgress;
          const targetY = layer.baseY + scramble + noise;

          point.y += (targetY - point.y) * 0.1;
        } else {
          // Decrypted - smooth sine wave
          const targetY = layer.baseY + Math.sin(normalizedX * Math.PI * 4 + layer.phase) * layer.amplitude;

          point.y += (targetY - point.y) * 0.1;
        }

        // Mouse influence
        if (this.enableInteraction) {
          const dx = point.x - this.mouseX;
          const dy = point.y - this.mouseY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < this.mouseInfluenceRadius) {
            const force = (1 - distance / this.mouseInfluenceRadius) * 30;
            point.y -= force;
          }
        }
      }

      // Draw waveform
      this.ctx.strokeStyle = layer.color;
      this.ctx.lineWidth = layer.encrypted ? 1.5 : 2;
      this.ctx.globalAlpha = layer.encrypted ? 0.6 : 0.8;
      this.ctx.shadowBlur = layer.encrypted ? 5 : 10;
      this.ctx.shadowColor = layer.color;

      if (layer.encrypted) {
        this.ctx.setLineDash([5, 5]);
      }

      this.ctx.beginPath();
      this.ctx.moveTo(layer.points[0].x, layer.points[0].y);

      for (let i = 1; i < layer.points.length; i++) {
        this.ctx.lineTo(layer.points[i].x, layer.points[i].y);
      }

      this.ctx.stroke();

      this.ctx.setLineDash([]);
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1.0;

      // Draw points on encrypted waveforms
      if (layer.encrypted) {
        for (let i = 0; i < layer.points.length; i += 5) {
          const point = layer.points[i];

          this.ctx.fillStyle = layer.color;
          this.ctx.globalAlpha = 0.5;
          this.ctx.beginPath();
          this.ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
          this.ctx.fill();
        }

        this.ctx.globalAlpha = 1.0;
      }
    }

    // Update and draw data bits
    for (const bit of this.bitPool) {
      if (!bit.active) continue;

      bit.x += bit.vx * dt;

      if (bit.x > this.width) {
        bit.active = false;
        continue;
      }

      // Find which layer this bit is on
      let onLayer: WaveformLayer | null = null;
      let minDistance = Infinity;

      for (const layer of this.layers) {
        const distance = Math.abs(layer.baseY - bit.y);
        if (distance < minDistance) {
          minDistance = distance;
          onLayer = layer;
        }
      }

      // Transform bit if layer encryption state changed
      if (onLayer && bit.encrypted !== onLayer.encrypted) {
        bit.transformProgress += dt * 3;

        if (bit.transformProgress >= 1.0) {
          bit.encrypted = onLayer.encrypted;
          bit.transformProgress = 0;
        }
      }

      // Draw bit
      const transformScale = bit.transformProgress > 0 ? 1 + Math.sin(bit.transformProgress * Math.PI) * 0.5 : 1;

      this.ctx.fillStyle = bit.color;
      this.ctx.globalAlpha = bit.encrypted ? 0.8 : 1.0;
      this.ctx.shadowBlur = bit.encrypted ? 8 : 12;
      this.ctx.shadowColor = bit.color;

      if (bit.encrypted) {
        // Draw as square for encrypted
        const size = bit.size * transformScale;
        this.ctx.fillRect(bit.x - size / 2, bit.y - size / 2, size, size);
      } else {
        // Draw as circle for decrypted
        this.ctx.beginPath();
        this.ctx.arc(bit.x, bit.y, bit.size * transformScale, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1.0;
    }

    // Spawn bits occasionally
    if (Math.random() < 0.08 * speedMultiplier) {
      const layerIndex = Math.floor(Math.random() * this.layers.length);
      this.spawnBit(layerIndex);
    }

    // Auto-toggle encryption state occasionally
    if (Math.random() < 0.005 * speedMultiplier) {
      const layer = this.layers[Math.floor(Math.random() * this.layers.length)];
      layer.encrypted = !layer.encrypted;
      layer.scrambleProgress = 0;
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    if (event.type === 'down' && this.enableInteraction) {
      // Find nearest layer
      let nearestLayer: WaveformLayer | null = null;
      let minDistance = Infinity;

      for (const layer of this.layers) {
        const distance = Math.abs(layer.baseY - event.y);
        if (distance < minDistance) {
          minDistance = distance;
          nearestLayer = layer;
        }
      }

      if (nearestLayer) {
        // Toggle encryption on click
        const type = nearestLayer.encrypted ? 'decrypt' : 'encrypt';
        this.spawnBurst(event.x, event.y, type);

        // Spawn multiple bits from click point
        for (let i = 0; i < 3; i++) {
          const bit = this.bitPool.find(b => !b.active);
          if (!bit) break;

          bit.active = true;
          bit.x = event.x;
          bit.y = event.y;
          bit.vx = (150 + Math.random() * 100) * this.speed;
          bit.encrypted = type === 'encrypt';
          bit.transformProgress = 0;
        }
      }
    }
  }

  resize(size: EffectSize): void {
    const width = size.width;
    const height = size.height;
    // Scale layer positions
    const scaleX = width / this.width;
    const scaleY = height / this.height;

    for (const layer of this.layers) {
      layer.baseY *= scaleY;

      for (const point of layer.points) {
        point.x *= scaleX;
        point.y *= scaleY;
      }
    }

    this.width = width;
    this.height = height;
    this.layerCount = Math.max(3, Math.floor(5 * this.density));

    // Reinitialize layers for new dimensions
    this.initializeLayers();
  }

  dispose(): void {
    this.layers = [];
    this.bitPool = [];
    this.burstPool = [];
  }
}
