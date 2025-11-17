import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Grid cell state
 */
interface GridCell {
  x: number;
  y: number;
  scanned: boolean;
  scanTime: number;
  threat: number; // 0-1, probability of being flagged
  flagged: boolean;
}

/**
 * Scanner bar that sweeps across the grid
 */
interface Scanner {
  position: number; // 0-1 progress
  speed: number;
  direction: 'horizontal' | 'vertical';
  thickness: number;
  color: string;
  active: boolean;
}

/**
 * ScanningGrid Effect - Security scanning grid with sweeping scanner bars.
 * Mouse interaction tilts/redirects scanner bars and reveals grid details.
 */
export class ScanningGrid implements VisualEffect {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  // Configuration
  private speed = 1;
  private colorScheme = ['#00ff00', '#00ff88', '#ffff00', '#ff0000'];
  private enableInteraction = true;
  private density = 1;
  private gridSize = 40; // Cell size in pixels
  private scannerCount = 3;

  // State
  private grid: GridCell[][] = [];
  private scanners: Scanner[] = [];
  private mouseX = -1000;
  private mouseY = -1000;
  private mouseInfluenceRadius = 200;
  private time = 0;

  init({ canvas, ctx, width, height }: EffectInitContext): void {
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.gridSize = Math.max(20, Math.floor(40 / this.density));

    this.initializeGrid();
    this.initializeScanners();
  }

  private initializeGrid(): void {
    this.grid = [];

    const cols = Math.ceil(this.width / this.gridSize);
    const rows = Math.ceil(this.height / this.gridSize);

    for (let row = 0; row < rows; row++) {
      this.grid[row] = [];
      for (let col = 0; col < cols; col++) {
        this.grid[row][col] = {
          x: col * this.gridSize,
          y: row * this.gridSize,
          scanned: false,
          scanTime: 0,
          threat: Math.random(),
          flagged: false,
        };
      }
    }
  }

  private initializeScanners(): void {
    this.scanners = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.scannerCount; i++) {
      this.scanners.push({
        position: Math.random(),
        speed: 0.05 + Math.random() * 0.1,
        direction: i % 2 === 0 ? 'horizontal' : 'vertical',
        thickness: 3 + Math.random() * 2,
        color: colors[i % colors.length],
        active: true,
      });
    }
  }

  private getCellAtPosition(x: number, y: number): GridCell | null {
    const col = Math.floor(x / this.gridSize);
    const row = Math.floor(y / this.gridSize);

    if (row >= 0 && row < this.grid.length && col >= 0 && col < this.grid[row].length) {
      return this.grid[row][col];
    }

    return null;
  }

  render(deltaTime: number, _totalMs: number): void {
    this.time += deltaTime;

    // Clear with fade
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const speedMultiplier = this.speed;
    const dt = deltaTime * 0.001;

    // Draw grid lines
    this.ctx.strokeStyle = 'rgba(0, 255, 100, 0.15)';
    this.ctx.lineWidth = 0.5;

    // Vertical lines
    for (let col = 0; col < this.grid[0]?.length || 0; col++) {
      const x = col * this.gridSize;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let row = 0; row < this.grid.length; row++) {
      const y = row * this.gridSize;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // Update and draw scanners
    for (let i = 0; i < this.scanners.length; i++) {
      const scanner = this.scanners[i];
      if (!scanner.active) continue;

      // Update position
      scanner.position += scanner.speed * speedMultiplier * dt;

      // Mouse influence - tilt/accelerate scanner
      if (this.enableInteraction) {
        const scannerPixelPos =
          scanner.direction === 'horizontal'
            ? scanner.position * this.height
            : scanner.position * this.width;

        const mousePos = scanner.direction === 'horizontal' ? this.mouseY : this.mouseX;
        const distance = Math.abs(scannerPixelPos - mousePos);

        if (distance < this.mouseInfluenceRadius) {
          // Accelerate when near mouse
          scanner.position += scanner.speed * speedMultiplier * dt * 0.3;
        }
      }

      // Wrap around
      if (scanner.position > 1.0) {
        scanner.position = 0;
        // Randomly flag some cells as threats
        this.flagRandomThreats();
      }

      // Draw scanner bar
      const gradient =
        scanner.direction === 'horizontal'
          ? this.ctx.createLinearGradient(
              0,
              scanner.position * this.height - scanner.thickness * 10,
              0,
              scanner.position * this.height + scanner.thickness * 10
            )
          : this.ctx.createLinearGradient(
              scanner.position * this.width - scanner.thickness * 10,
              0,
              scanner.position * this.width + scanner.thickness * 10,
              0
            );

      gradient.addColorStop(0, 'rgba(0, 255, 100, 0)');
      gradient.addColorStop(0.5, scanner.color);
      gradient.addColorStop(1, 'rgba(0, 255, 100, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.shadowBlur = 20;
      this.ctx.shadowColor = scanner.color;

      if (scanner.direction === 'horizontal') {
        this.ctx.fillRect(0, scanner.position * this.height - scanner.thickness, this.width, scanner.thickness * 2);
      } else {
        this.ctx.fillRect(scanner.position * this.width - scanner.thickness, 0, scanner.thickness * 2, this.height);
      }

      this.ctx.shadowBlur = 0;

      // Mark scanned cells
      this.markScannedCells(scanner);
    }

    // Draw scanned and flagged cells
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.scanned) {
          const age = this.time - cell.scanTime;
          const fadeTime = 2000; // 2 seconds
          const alpha = Math.max(0, 1 - age / fadeTime);

          if (alpha > 0) {
            if (cell.flagged) {
              // Flagged threat - red
              this.ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.3})`;
              this.ctx.fillRect(cell.x + 1, cell.y + 1, this.gridSize - 2, this.gridSize - 2);

              // Pulsing border
              const pulse = Math.sin(this.time * 0.005) * 0.5 + 0.5;
              this.ctx.strokeStyle = `rgba(255, 0, 0, ${alpha * pulse})`;
              this.ctx.lineWidth = 2;
              this.ctx.strokeRect(cell.x + 2, cell.y + 2, this.gridSize - 4, this.gridSize - 4);
            } else {
              // Safe - green
              this.ctx.fillStyle = `rgba(0, 255, 100, ${alpha * 0.2})`;
              this.ctx.fillRect(cell.x + 1, cell.y + 1, this.gridSize - 2, this.gridSize - 2);
            }
          }
        }

        // Highlight cell under mouse
        if (this.enableInteraction) {
          const dx = cell.x + this.gridSize / 2 - this.mouseX;
          const dy = cell.y + this.gridSize / 2 - this.mouseY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < this.gridSize) {
            this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(cell.x + 1, cell.y + 1, this.gridSize - 2, this.gridSize - 2);

            // Show threat level
            const threatBar = cell.threat * (this.gridSize - 4);
            this.ctx.fillStyle = cell.threat > 0.7 ? 'rgba(255, 0, 0, 0.5)' : 'rgba(255, 255, 0, 0.5)';
            this.ctx.fillRect(cell.x + 2, cell.y + this.gridSize - 6, threatBar, 4);
          }
        }
      }
    }
  }

  private markScannedCells(scanner: Scanner): void {
    const scanPixelPos =
      scanner.direction === 'horizontal' ? scanner.position * this.height : scanner.position * this.width;

    const threshold = scanner.thickness * 2;

    for (const row of this.grid) {
      for (const cell of row) {
        const cellPos =
          scanner.direction === 'horizontal' ? cell.y + this.gridSize / 2 : cell.x + this.gridSize / 2;

        const distance = Math.abs(cellPos - scanPixelPos);

        if (distance < threshold && !cell.scanned) {
          cell.scanned = true;
          cell.scanTime = this.time;
        }
      }
    }
  }

  private flagRandomThreats(): void {
    for (const row of this.grid) {
      for (const cell of row) {
        // High-threat cells get flagged
        if (cell.threat > 0.8 && Math.random() < 0.3) {
          cell.flagged = true;
        }
      }
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    if (event.type === 'down' && this.enableInteraction) {
      // Clicking creates a new scanner at mouse position
      const cell = this.getCellAtPosition(event.x, event.y);
      if (cell) {
        // Spawn temporary scanner
        const newScanner: Scanner = {
          position: Math.random() < 0.5 ? event.y / this.height : event.x / this.width,
          speed: 0.15,
          direction: Math.random() < 0.5 ? 'horizontal' : 'vertical',
          thickness: 4,
          color: this.colorScheme[2],
          active: true,
        };

        this.scanners.push(newScanner);

        // Remove after one pass
        setTimeout(() => {
          const index = this.scanners.indexOf(newScanner);
          if (index > -1) {
            this.scanners.splice(index, 1);
          }
        }, (1 / newScanner.speed) * 1000);
      }
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;
    this.gridSize = Math.max(20, Math.floor(40 / this.density));

    // Reinitialize grid for new dimensions
    this.initializeGrid();
  }

  dispose(): void {
    this.grid = [];
    this.scanners = [];
  }
}
