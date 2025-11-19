import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('react-native-svg/lib/commonjs/lib/SvgTouchableMixin.js', () => ({}));
