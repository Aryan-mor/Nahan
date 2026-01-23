
import { describe, expect, it, vi } from 'vitest';
import { encodeBase122 } from '../steganography/base122';
import { StegoFactory } from '../steganography/factory';
import { registerAllProviders } from '../steganography/providers';
import { embedPayload, extractPayload } from '../steganography/steganography';
import { AlgorithmType } from '../steganography/types';

// Mock steganography module functions
// We need to keep the original implementation for other tests but mock extractPayload for the legacy test
// This is tricky with vi.mock at top level.
// Instead, we will spy on the imported module in the test.
// Since index.ts imports named exports, we can mock the module.

vi.mock('../steganography/steganography', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../steganography/steganography')>();
  return {
    ...actual,
    extractPayload: vi.fn(actual.extractPayload),
    embedPayload: vi.fn(actual.embedPayload),
  };
});

// Register providers for testing
registerAllProviders();

// Mock i18next
vi.mock('i18next', () => ({
  default: {
    t: (key: string, defaultValue: string) => defaultValue || key,
  },
}));

// Mock Canvas and Context
class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: PredefinedColorSpace = 'srgb';

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

const mockCtx = {
  getImageData: vi.fn(),
  putImageData: vi.fn(),
};

const mockCanvas = {
  width: 100,
  height: 100,
  getContext: vi.fn(() => mockCtx),
  toBlob: vi.fn((cb) => cb(new Blob(['mock']))),
} as unknown as HTMLCanvasElement;

function setupImage(width: number, height: number): { imageData: MockImageData; originalData: Uint8ClampedArray } {
  const imageData = new MockImageData(width, height);
  for (let i = 0; i < imageData.data.length; i++) {
    imageData.data[i] = Math.floor(Math.random() * 256);
  }
  const originalData = new Uint8ClampedArray(imageData.data);
  mockCanvas.width = width;
  mockCanvas.height = height;
  mockCtx.getImageData.mockReturnValue(imageData);
  return { imageData, originalData };
}

function wasModified(imageData: MockImageData, originalData: Uint8ClampedArray): boolean {
  for (let i = 0; i < imageData.data.length; i++) {
    if (imageData.data[i] !== originalData[i]) return true;
  }
  return false;
}

describe('LSB-2 Steganography Basics', () => {
  it('should embed and extract data correctly', async () => {
    const { imageData, originalData } = setupImage(20, 20);

    // Payload
    const payload = 'TestPayload123!';

    // Embed
    await embedPayload(mockCanvas, payload);

    // Verify data was modified
    expect(wasModified(imageData, originalData)).toBe(true);

    // Extract
    const extracted = extractPayload(mockCanvas);
    expect(extracted).toBe(payload);
  });

  it('should throw error if capacity exceeded', async () => {
    setupImage(2, 2);

    const hugePayload = 'A'.repeat(100); // 100 bytes > 4 pixels * 6 bits = 24 bits = 3 bytes capacity

    await expect(embedPayload(mockCanvas, hugePayload)).rejects.toThrow('Image capacity exceeded');
  });
});

describe('LSB-2 Steganography Integration', () => {
  it('should integrate with NH07Provider', async () => {
    setupImage(50, 50); // Sufficient size
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const factory = StegoFactory.getInstance();
    const nh07 = factory.getProvider(AlgorithmType.NH07);

    // Encode with provider (adds magic header)
    const encodedString = await nh07.encode(payload);

    // Embed
    await embedPayload(mockCanvas, encodedString);

    // Extract
    const extractedString = extractPayload(mockCanvas);

    // Decode with provider
    const decodedPayload = await nh07.decode(extractedString);

    expect(decodedPayload).toEqual(payload);
  });

  it('should handle legacy payloads (backward compatibility)', async () => {
    setupImage(50, 50);
    const payload = new Uint8Array([10, 20, 30]);

    // Legacy encode (direct base122, no magic header)
    const encodedString = encodeBase122(payload);

    // Embed
    await embedPayload(mockCanvas, encodedString);

    // Extract
    const extractedString = extractPayload(mockCanvas);

    // Decode with NH07 (should detect missing header and fallback)
    const factory = StegoFactory.getInstance();
    const nh07 = factory.getProvider(AlgorithmType.NH07);
    const decodedPayload = await nh07.decode(extractedString);

    expect(decodedPayload).toEqual(payload);
  });
});

// Mocks
const cryptoServiceMock = vi.hoisted(() => ({
  encryptMessage: vi.fn(),
  decryptMessage: vi.fn(),
  signMessage: vi.fn(),
  verifySignedMessage: vi.fn(),
}));

// Mock global CryptoService.getInstance
vi.mock('../crypto', () => ({
  CryptoService: {
    getInstance: () => cryptoServiceMock,
  },
}));

// Mock internal steganography functions that rely on Canvas/DOM
vi.mock('../steganography/imageUtils', () => ({
  optimizeImage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  generateMeshGradient: vi.fn().mockReturnValue({
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(100), width: 5, height: 5 }),
      putImageData: () => {},
      imageSmoothingEnabled: false,
    }),
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(['mock'])),
    width: 5,
    height: 5,
  }),
}));

// Shared mock canvas for tests
const sharedMockCanvas = {
  getContext: () => ({
    getImageData: () => ({ data: new Uint8ClampedArray(100), width: 5, height: 5 }),
    putImageData: () => {},
    imageSmoothingEnabled: false,
  }),
  width: 5,
  height: 5,
};

describe('ImageSteganographyService Encoding', () => {
  // Actually, we can just test the integration logic if we mock the lower-level calls
  // The service calls:
  // 1. optimizeImage -> Mocked
  // 2. CryptoService.encrypt -> Mocked
  // 3. StegoFactory -> NH07 -> encode -> Returns string
  // 4. embedPayload -> Mocked? No, it's imported.

  it('should use NH07Provider during encoding', async () => {
    const { NH07Provider } = await import('../steganography/providers/nh07');
    const encodeSpy = vi.spyOn(NH07Provider.prototype, 'encode');
    cryptoServiceMock.encryptMessage.mockResolvedValue(new Uint8Array([10, 20, 30]));
    const { ImageSteganographyService } = await import('../steganography/index');
    const service = ImageSteganographyService.getInstance();
    const mockFile = new File(['mock data'], 'test.png');
    try { await service.encode(mockFile, 'priv', 'pass', 'pub'); } catch (_e) { /* ignore */ }
    expect(encodeSpy).toHaveBeenCalled();
  });
});

describe('ImageSteganographyService Decoding', () => {

  it('should handle legacy payload decoding fallback', async () => {
    const { ImageSteganographyService } = await import('../steganography/index');
    const service = ImageSteganographyService.getInstance();
    const stegoModule = await import('../steganography/steganography');
    const legacyBytes = new Uint8Array([1, 2, 3]);
    const legacyString = encodeBase122(legacyBytes);

    vi.mocked(stegoModule.extractPayload).mockReturnValue(legacyString);
    const { NH07Provider } = await import('../steganography/providers/nh07');
    const decodeSpy = vi.spyOn(NH07Provider.prototype, 'decode');

    (service as unknown as { loadCarrierCanvas: (f: File) => Promise<HTMLCanvasElement> }).loadCarrierCanvas = vi.fn().mockResolvedValue(sharedMockCanvas);

    cryptoServiceMock.decryptMessage.mockResolvedValue({
      data: new Uint8Array([99]),
      senderPublicKey: 'sender',
    });

    await service.decode(new File([], 't.png'), 'priv', 'pass', ['pub']);

    expect(decodeSpy).toHaveBeenCalled();
    expect(vi.mocked(stegoModule.extractPayload)).toHaveBeenCalled();
    const spyResult = await decodeSpy.mock.results[0].value;
    expect(spyResult).toEqual(legacyBytes);
  });
});
