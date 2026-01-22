import { AlgorithmMetadata, AlgorithmType } from '../types';
import { BaseStegoProvider } from './baseProvider';

export class NH02Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH02;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH02,
      name: "Invisible Logic",
      description: "Hides data using ZWNJ/ZWJ characters",
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
