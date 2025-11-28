import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Expo's web shims expect __DEV__ to exist even in jsdom/happy-dom.
if (typeof (globalThis as any).__DEV__ === 'undefined') {
  (globalThis as any).__DEV__ = false;
}

vi.mock('react-native-svg/lib/commonjs/lib/SvgTouchableMixin.js', () => ({}));
