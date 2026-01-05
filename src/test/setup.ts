/**
 * Test setup file for Vitest
 * Configures global test environment
 */
import { webcrypto } from 'node:crypto';

// Polyfill crypto for Node environment
if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        writable: true,
    });
} else if (!globalThis.crypto.subtle) {
    // If crypto exists but subtle is missing (JSDOM sometimes), patch it
    Object.defineProperty(globalThis.crypto, 'subtle', {
        value: webcrypto.subtle,
        writable: true,
    });
}

// Mock console methods to reduce noise in tests (optional - can be removed if you want to see logs)
// Uncomment if you want to suppress console output during tests
// global.console = {
//   ...console,
//   log: vi.fn(),
//   debug: vi.fn(),
//   warn: vi.fn(),
//   error: vi.fn(),
// };
