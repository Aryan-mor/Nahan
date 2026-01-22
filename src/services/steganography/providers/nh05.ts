import { AlgorithmMetadata, AlgorithmType } from '../types';
import { BaseStegoProvider } from './baseProvider';

export class NH05Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH05;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH05,
      name: "Script Expert",
      description: "Language-specific steganography (e.g., Persian kashida)",
      stealthLevel: 4,
      platform: 'universal',
      requiresCoverText: true,
      supportsAutoDetect: true
    };
  }

  getCapacity(_coverText?: string): number {
    return 0;
  }

  async encode(_payload: Uint8Array, _coverText?: string): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async decode(_stegoText: string): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }
}
