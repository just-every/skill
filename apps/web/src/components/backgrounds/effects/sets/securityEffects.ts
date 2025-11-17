import { EncryptionWaveform } from '../EncryptionWaveform';
import { LockConstellation } from '../LockConstellation';
import { NetworkGraph } from '../NetworkGraph';
import { ScanningGrid } from '../ScanningGrid';
import { ShieldPulse } from '../ShieldPulse';
import type { EffectDefinition } from '../types';

export const securityEffects: EffectDefinition[] = [
  {
    id: 'security-network-graph',
    name: 'Network Graph',
    tags: ['security'],
    description: 'Dynamic node graph with secure packet traffic and cursor highlighting.',
    factory: () => new NetworkGraph()
  },
  {
    id: 'security-scanning-grid',
    name: 'Scanning Grid',
    tags: ['security'],
    description: 'Security console grid with sweeping scanners and threat markers.',
    factory: () => new ScanningGrid()
  },
  {
    id: 'security-shield-pulse',
    name: 'Shield Pulse',
    tags: ['security'],
    description: 'Hex shield segments with pulse waves and impact particles.',
    factory: () => new ShieldPulse()
  },
  {
    id: 'security-lock-constellation',
    name: 'Lock Constellation',
    tags: ['security'],
    description: 'Lock icons connected by energy flows that unlock near the cursor.',
    factory: () => new LockConstellation()
  },
  {
    id: 'security-encryption-waveform',
    name: 'Encryption Waveform',
    tags: ['security'],
    description: 'Layered waveforms toggling between encrypted and decrypted states.',
    factory: () => new EncryptionWaveform()
  }
];
