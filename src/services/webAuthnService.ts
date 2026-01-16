/* eslint-disable max-lines-per-function */
import * as logger from '../utils/logger';

export interface WebAuthnCredential {
  id: string;
  rawId: ArrayBuffer;
  response: AuthenticatorAttestationResponse;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  type: 'public-key';
}

export class WebAuthnService {
  private static instance: WebAuthnService;

  private constructor() {}

  static getInstance(): WebAuthnService {
    if (!WebAuthnService.instance) {
      WebAuthnService.instance = new WebAuthnService();
    }
    return WebAuthnService.instance;
  }

  /**
   * Check if WebAuthn and PRF extension are supported
   */
  /**
   * Check if WebAuthn and PRF extension are supported
   */
  async isSupported(): Promise<boolean> {
    if (!window.PublicKeyCredential) return false;

    // Check mainly for platform authenticators (TouchID, Windows Hello)
    const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!isAvailable) return false;

    // Check for PRF capability if supported by browser
    if (PublicKeyCredential.getClientCapabilities) {
       const caps = await PublicKeyCredential.getClientCapabilities();
       // prf check - note: some browsers might support prf but not report it in capabilities yet,
       // so strictly blocking on this might be too aggressive, but adhering to user request for check.
       // However, the user said "If not supported, gracefully inform...".
       // We'll trust the capability check if available.
       // Casting to any because 'prf' might not be in the TS definition yet
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       if (!(caps as any).prf) {
           logger.warn('WebAuthn: Start PRF capability check failed');
           // Proceeding with caution or returning false?
           // User Objective: "If not supported, gracefully inform the user or hide the biometric option."
           return false;
       }
    }

    return true;
  }

  /**
   * Register a new credential with PRF extension enabled
   * Returns the credential ID and the initial PRF secret (if available immediately)
   */
  async register(
    userId: string,
    userName: string
  ): Promise<{ credentialId: string; hardwareSecret?: Uint8Array } | null> {
    if (!await this.isSupported()) return null;

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBuffer = new TextEncoder().encode(userId);

      const createOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: 'Nahan Secure Chat',
          id: window.location.hostname, // Must match current domain
        },
        user: {
          id: userIdBuffer,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Prefer internal (TouchID/Hello)
          userVerification: 'required', // Mobile Requirement
          residentKey: 'required', // Mobile Requirement
          requireResidentKey: true, // Mobile Requirement (legacy compat)
        },
        timeout: 60000,
        attestation: 'none',
        extensions: {
          // prf types missing in some definitions
          prf: {
            eval: {
              first: new TextEncoder().encode('nahan-master-key-salt'),
            },
          },
        },
      };

      const credential = (await navigator.credentials.create({
        publicKey: createOptions,
      })) as PublicKeyCredential;

      if (!credential) return null;

      // Extract PRF result if available
      const extensions = credential.getClientExtensionResults();
      // prf types missing
      const prfResults = extensions.prf;
      let hardwareSecret: Uint8Array | undefined;

      if (prfResults && prfResults.results && prfResults.results.first) {
        hardwareSecret = this.toUint8Array(prfResults.results.first);
      }

      return {
        credentialId: credential.id,
        hardwareSecret,
      };

    } catch (error) {
      if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
              logger.warn('WebAuthn Registration Cancelled by User');
          } else if (error.name === 'SecurityError') {
              logger.error('WebAuthn Security Error (Origin/Context):', error);
          } else {
              logger.error('WebAuthn Registration Failed:', error);
          }
      }
      return null;
    }
  }

  /**
   * Authenticate and retrieve the PRF secret (Hardware Secret)
   */
  async getHardwareSecret(credentialId?: string, options?: { signal?: AbortSignal }): Promise<Uint8Array | null> {
    if (!await this.isSupported()) return null;

    try {
       const challenge = crypto.getRandomValues(new Uint8Array(32));

       const getOptions: PublicKeyCredentialRequestOptions = {
         challenge,
         rpId: window.location.hostname,
         userVerification: 'required', // Mobile Requirement
         timeout: 60000,
         allowCredentials: credentialId ? [{
           id: this.base64UrlToUint8Array(credentialId),
           type: 'public-key',
           transports: ['internal']
         }] : [],
         extensions: {
           // prf types missing
           prf: {
             eval: {
               first: new TextEncoder().encode('nahan-master-key-salt'),
             },
           },
         },
       };

       const credential = (await navigator.credentials.get({
         publicKey: getOptions,
         signal: options?.signal
       })) as PublicKeyCredential;

       if (!credential) return null;

       const extensions = credential.getClientExtensionResults();
       // prf types missing
       const prfResults = extensions.prf;

       if (prfResults && prfResults.results && prfResults.results.first) {
         return this.toUint8Array(prfResults.results.first);
       }

       logger.warn('WebAuthn success but no PRF returned');
       return null;

    } catch (error) {
        if (error instanceof Error) {
            if (error.name === 'NotAllowedError') {
                logger.warn('WebAuthn Authentication Cancelled by User');
            } else if (error.name === 'SecurityError') {
                logger.error('WebAuthn Security Error:', error);
            } else {
                logger.error('WebAuthn Get Secret Failed:', error);
            }
        }
       return null;
    }
  }

  /**
   * Helper to convert Base64URL string to Uint8Array safely
   */
  private base64UrlToUint8Array(base64Url: string): Uint8Array {
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
      return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  }

  /**
   * Helper to convert BufferSource (ArrayBuffer or ArrayBufferView) to Uint8Array safely
   */
  private toUint8Array(source: BufferSource): Uint8Array {
    if (source instanceof ArrayBuffer) {
      return new Uint8Array(source);
    }
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }
}

export const webAuthnService = WebAuthnService.getInstance();
