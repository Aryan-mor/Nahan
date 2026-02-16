import * as logger from '../../utils/logger';
import { AlgorithmType, StegoProvider } from './types';

export class StegoFactory {
  private static instance: StegoFactory;
  private providers: Map<AlgorithmType, StegoProvider>;

  private constructor() {
    this.providers = new Map();
  }

  public static getInstance(): StegoFactory {
    if (!StegoFactory.instance) {
      StegoFactory.instance = new StegoFactory();
    }
    return StegoFactory.instance;
  }

  public registerProvider(provider: StegoProvider): void {
    const id = provider.getAlgorithmId();
    if (this.providers.has(id)) {
      logger.warn(`Provider for algorithm ${id} is already registered. Overwriting.`);
    }
    this.providers.set(id, provider);
  }

  public getProvider(algorithmId: AlgorithmType): StegoProvider {
    const provider = this.providers.get(algorithmId);
    if (!provider) {
      throw new Error(`No provider registered for algorithm: ${algorithmId}`);
    }
    return provider;
  }

  public getAllProviders(): StegoProvider[] {
    return Array.from(this.providers.values());
  }

  public getDefaultProvider(): StegoProvider {
    // Return NH07 (Base122/Image) as default for backward compatibility
    // In a future update, this could pull from user preferences
    return this.getProvider(AlgorithmType.NH07);
  }
}
