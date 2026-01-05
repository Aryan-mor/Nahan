import { describe, it, expect, vi } from 'vitest';
import { embedPayload, extractPayload } from '../steganography/steganography';

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

function setupImage(width: number, height: number) {
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

function wasModified(imageData: MockImageData, originalData: Uint8ClampedArray) {
  for (let i = 0; i < imageData.data.length; i++) {
    if (imageData.data[i] !== originalData[i]) return true;
  }
  return false;
}

describe('LSB-2 Steganography', () => {
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
