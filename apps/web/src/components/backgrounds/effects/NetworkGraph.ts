import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Network node in the graph
 */
interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  highlighted: boolean;
  pulsePhase: number;
}

/**
 * Data packet traveling between nodes
 */
interface Packet {
  active: boolean;
  fromNode: number;
  toNode: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
}

/**
 * NetworkGraph Effect - Animated network topology with data packets flowing between nodes.
 * Subtle mouse interaction highlights nearby nodes and attracts packets.
 */
export class NetworkGraph implements VisualEffect {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  // Configuration
  private speed = 1;
  private colorScheme = ['#00ff88', '#00ccff', '#0088ff', '#00ffcc'];
  private enableInteraction = true;
  private density = 1;
  private nodeCount = 30;
  private maxConnections = 3;
  private connectionDistance = 200;
  private packetPoolSize = 20;

  // State
  private nodes: Node[] = [];
  private connections: Array<[number, number]> = [];
  private packetPool: Packet[] = [];
  private mouseX = -1000;
  private mouseY = -1000;
  private mouseInfluenceRadius = 150;

  init({ canvas, ctx, width, height }: EffectInitContext): void {
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.nodeCount = Math.floor(30 * this.density);

    // Initialize nodes
    this.initializeNodes();

    // Build connection graph
    this.buildConnections();

    // Initialize packet pool
    this.initializePacketPool();
  }

  private initializeNodes(): void {
    this.nodes = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.nodeCount; i++) {
      this.nodes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 3 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        highlighted: false,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  private buildConnections(): void {
    this.connections = [];

    // For each node, connect to nearest neighbors
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const distances: Array<{ index: number; distance: number }> = [];

      for (let j = 0; j < this.nodes.length; j++) {
        if (i === j) continue;

        const other = this.nodes[j];
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.connectionDistance) {
          distances.push({ index: j, distance });
        }
      }

      // Sort by distance and take closest connections
      distances.sort((a, b) => a.distance - b.distance);
      const connectCount = Math.min(this.maxConnections, distances.length);

      for (let k = 0; k < connectCount; k++) {
        const targetIndex = distances[k].index;

        // Only add if connection doesn't already exist
        const exists = this.connections.some(
          ([a, b]) => (a === i && b === targetIndex) || (a === targetIndex && b === i)
        );

        if (!exists) {
          this.connections.push([i, targetIndex]);
        }
      }
    }
  }

  private initializePacketPool(): void {
    this.packetPool = [];
    const colors = this.colorScheme;

    for (let i = 0; i < this.packetPoolSize; i++) {
      this.packetPool.push({
        active: false,
        fromNode: 0,
        toNode: 0,
        progress: 0,
        speed: 0.3 + Math.random() * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2,
      });
    }
  }

  private spawnPacket(): void {
    // Find inactive packet
    const packet = this.packetPool.find((p) => !p.active);
    if (!packet || this.connections.length === 0) return;

    // Pick random connection
    const connection = this.connections[Math.floor(Math.random() * this.connections.length)];

    packet.active = true;
    packet.fromNode = connection[0];
    packet.toNode = connection[1];
    packet.progress = 0;
    packet.speed = (0.3 + Math.random() * 0.4) * this.speed;
  }

  render(deltaTime: number, _totalMs: number): void {
    // Clear canvas with subtle fade
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const speedMultiplier = this.speed;
    const dt = deltaTime * 0.001; // Convert to seconds

    // Update and check for mouse proximity
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      // Update position with drift
      node.x += node.vx * speedMultiplier;
      node.y += node.vy * speedMultiplier;

      // Wrap around screen edges
      if (node.x < 0) node.x = this.width;
      if (node.x > this.width) node.x = 0;
      if (node.y < 0) node.y = this.height;
      if (node.y > this.height) node.y = 0;

      // Update pulse phase
      node.pulsePhase += dt * 2;

      // Check mouse proximity
      if (this.enableInteraction) {
        const dx = node.x - this.mouseX;
        const dy = node.y - this.mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        node.highlighted = distance < this.mouseInfluenceRadius;
      } else {
        node.highlighted = false;
      }
    }

    // Draw connections
    this.ctx.strokeStyle = 'rgba(0, 255, 150, 0.1)';
    this.ctx.lineWidth = 1;

    for (const [i, j] of this.connections) {
      const nodeA = this.nodes[i];
      const nodeB = this.nodes[j];

      this.ctx.beginPath();
      this.ctx.moveTo(nodeA.x, nodeA.y);
      this.ctx.lineTo(nodeB.x, nodeB.y);
      this.ctx.stroke();
    }

    // Update and draw packets
    for (const packet of this.packetPool) {
      if (!packet.active) continue;

      // Update progress
      packet.progress += packet.speed * speedMultiplier * dt;

      // Check for mouse proximity - accelerate nearby packets
      if (this.enableInteraction) {
        const fromNode = this.nodes[packet.fromNode];
        const toNode = this.nodes[packet.toNode];
        const px = fromNode.x + (toNode.x - fromNode.x) * packet.progress;
        const py = fromNode.y + (toNode.y - fromNode.y) * packet.progress;

        const dx = px - this.mouseX;
        const dy = py - this.mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.mouseInfluenceRadius) {
          packet.progress += packet.speed * speedMultiplier * dt * 0.5; // Extra boost
        }
      }

      // Deactivate if reached destination
      if (packet.progress >= 1.0) {
        packet.active = false;
        continue;
      }

      // Draw packet
      const fromNode = this.nodes[packet.fromNode];
      const toNode = this.nodes[packet.toNode];
      const px = fromNode.x + (toNode.x - fromNode.x) * packet.progress;
      const py = fromNode.y + (toNode.y - fromNode.y) * packet.progress;

      this.ctx.fillStyle = packet.color;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = packet.color;
      this.ctx.beginPath();
      this.ctx.arc(px, py, packet.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    // Draw nodes
    for (const node of this.nodes) {
      const pulseScale = 1 + Math.sin(node.pulsePhase) * 0.2;
      const radius = node.radius * (node.highlighted ? 1.5 : 1.0) * pulseScale;
      const alpha = node.highlighted ? 1.0 : 0.6;

      this.ctx.fillStyle = node.color;
      this.ctx.globalAlpha = alpha;
      this.ctx.shadowBlur = node.highlighted ? 15 : 5;
      this.ctx.shadowColor = node.color;

      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.globalAlpha = 1.0;
      this.ctx.shadowBlur = 0;
    }

    // Occasionally spawn new packets
    if (Math.random() < 0.05 * speedMultiplier) {
      this.spawnPacket();
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    if (event.type === 'down' && this.enableInteraction) {
      for (let i = 0; i < 3; i += 1) {
        this.spawnPacket();
      }
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;
    this.initializeNodes();
    this.buildConnections();
  }

  dispose(): void {
    // Clear state
    this.nodes = [];
    this.connections = [];
    this.packetPool = [];
  }
}
