
const ctx: Worker = self as unknown as Worker;

interface AuthWorkerRequest {
  id: string;
  type: 'deriveWrapperKey';
  payload: {
    pin: string;
    hardwareSecret: Uint8Array;
    salt: Uint8Array;
  };
}

const handleDeriveWrapperKey = async (payload: AuthWorkerRequest['payload']): Promise<JsonWebKey> => {
  const { pin, hardwareSecret, salt } = payload;
  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);

  // Combine PIN and Hardware Secret
  const combinedMaterial = new Uint8Array(pinBuffer.length + hardwareSecret.length);
  combinedMaterial.set(pinBuffer, 0);
  combinedMaterial.set(hardwareSecret, pinBuffer.length);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    combinedMaterial,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-KW', length: 256 }, // AES-KW for wrapping
    true, // Extractable so we can export back to main thread
    ['wrapKey', 'unwrapKey']
  );

  // Export as JWK to transfer back to main thread (CryptoKey is not transferable in all browsers yet, but structured clone supports it in modern ones)
  // Actually, CryptoKey IS structured cloneable in modern browsers. Let's try returning it directly or exporting.
  // Ideally return CryptoKey if supported. If not, JWK.
  // React/Vite env usually supports it.
  // But to be safe and simple, let's export to JWK.
  return await crypto.subtle.exportKey('jwk', derivedKey);
};

ctx.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data as AuthWorkerRequest;

  try {
    if (type === 'deriveWrapperKey') {
      const result = await handleDeriveWrapperKey(payload);
      ctx.postMessage({ id, success: true, data: result });
    }
  } catch (error) {
    ctx.postMessage({ id, success: false, error: (error as Error).message });
  }
};

export { };

