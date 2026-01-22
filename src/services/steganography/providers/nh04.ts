import { AlgorithmMetadata, AlgorithmType } from '../types';
import { BaseStegoProvider } from './baseProvider';

export class NH04Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH04;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH04,
      name: "Whitespace",
      description: "Hides data by manipulating whitespace characters",
      stealthLevel: 2,
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
