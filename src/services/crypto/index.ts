import { decryptMessage, encryptMessage } from './encryption';
import {
    clearSensitiveData,
    generateKeyPair,
    getFingerprint,
    getNameFromKey,
    isValidKeyFormat,
    parseKeyInput,
    removeNameFromKey,
    validatePassphrase,
    verifyPrivateKeyPassphrase,
} from './keys';
import { signMessage, verifySignedMessage } from './signing';


export class CryptoService {
  private static instance: CryptoService;

  private constructor() {}

  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  // Key Management
  generateKeyPair = generateKeyPair;
  verifyPrivateKeyPassphrase = verifyPrivateKeyPassphrase;
  getFingerprint = getFingerprint;
  isValidKeyFormat = isValidKeyFormat;
  parseKeyInput = parseKeyInput;
  getNameFromKey = getNameFromKey;
  removeNameFromKey = removeNameFromKey;
  validatePassphrase = validatePassphrase;
  clearSensitiveData = clearSensitiveData;

  // Protocol (Encryption/Signing)
  encryptMessage = encryptMessage;
  decryptMessage = decryptMessage;
  signMessage = signMessage;
  verifySignedMessage = verifySignedMessage;
}

export const cryptoService = CryptoService.getInstance();

if (typeof window !== 'undefined') {
  // @ts-expect-error - testing
  window.cryptoService = cryptoService;
}
