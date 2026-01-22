import { AlgorithmMetadata, AlgorithmType } from '../types';
import { BaseStegoProvider } from './baseProvider';

export class NH03Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH03;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH03,
      name: "Emoji Map",
      description: "Hides data within emoji sequences",
      stealthLevel: 2,
      platform: 'social',
      requiresCoverText: false,
      supportsAutoDetect: false
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
