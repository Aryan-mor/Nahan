
export enum AlgorithmType {
  NH01 = 'NH01',
  NH02 = 'NH02',
  NH03 = 'NH03',
  NH04 = 'NH04',
  NH05 = 'NH05',
  NH06 = 'NH06',
  NH07 = 'NH07'
}

export interface AlgorithmMetadata {
  id: AlgorithmType;
  name: string;
  description: string;
  stealthLevel: 1 | 2 | 3 | 4 | 5;
  platform: 'universal' | 'desktop' | 'mobile' | 'social';
  requiresCoverText: boolean;
  supportsAutoDetect: boolean;
}

export interface EncodeOptions {
  coverText?: string;
  language?: 'fa' | 'en';
  recipientPublicKey?: string;
  senderPrivateKey: string;
  passphrase: string;
}

export interface DecodeOptions {
  recipientPrivateKey: string;
  passphrase: string;
  senderPublicKeys: string[];
}

export interface StegoProvider {
  /**
   * Encodes the payload into a steganographic string
   */
  encode(payload: Uint8Array, coverText?: string): Promise<string>;

  /**
   * Decodes the payload from a steganographic string
   */
  decode(stegoText: string): Promise<Uint8Array>;

  /**
   * Returns the unique algorithm identifier
   */
  getAlgorithmId(): AlgorithmType;

  /**
   * Returns the maximum payload size in bytes for the given cover text
   */
  getCapacity(coverText?: string): number;

  /**
   * Returns metadata about the algorithm
   */
  getMetadata(): AlgorithmMetadata;
}
