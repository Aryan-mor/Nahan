import { AlgorithmMetadata, AlgorithmType } from '../types';
import { BaseStegoProvider } from './baseProvider';

export class NH01Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH01;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH01,
      name: "Unicode Tags",
      description: "Hides data using Unicode Tag characters",
      stealthLevel: 3,
      platform: 'universal',
      requiresCoverText: true,
      supportsAutoDetect: true
    };
  }

  getCapacity(coverText?: string): number {
    return coverText ? coverText.length : 0;
  }

  async encode(_payload: Uint8Array, _coverText?: string): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async decode(_stegoText: string): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }
}
