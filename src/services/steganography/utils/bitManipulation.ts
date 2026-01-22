export function bytesToBits(data: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    for (let j = 7; j >= 0; j--) {
      bits.push((byte >> j) & 1);
    }
  }
  return bits;
}

export function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      if (i + j < bits.length) {
        byte |= (bits[i + j] << (7 - j));
      }
    }
    bytes[i / 8] = byte;
  }
  return bytes;
}

export function extractBitsFromByte(byte: number, startBit: number, numBits: number): number {
  const mask = (1 << numBits) - 1;
  const shift = 8 - startBit - numBits;
  return (byte >> shift) & mask;
}

export function createBitBuffer() {
  const buffer: number[] = [];

  return {
    push: (bits: number[]) => buffer.push(...bits),
    pop: (count: number) => {
      if (buffer.length < count) return null;
      return buffer.splice(0, count);
    },
    getAll: () => [...buffer],
    getLength: () => buffer.length,
    clear: () => { buffer.length = 0; }
  };
}
