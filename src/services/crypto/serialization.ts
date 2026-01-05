/**
 * Nahan Compact Protocol Version
 */
export const PROTOCOL_VERSION = 0x01;
export const SIGNED_PROTOCOL_VERSION = 0x02;

/**
 * Serialize encrypted message in Nahan Compact Protocol format
 * Format: [Version (1)] [Nonce (24)] [Sender Public Key (32)] [Encrypted Payload]
 */
export function serializeEncryptedMessage(
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  encryptedPayload: Uint8Array,
): Uint8Array {
  const totalLength = 1 + 24 + 32 + encryptedPayload.length;
  const serialized = new Uint8Array(totalLength);
  let offset = 0;

  // Version byte
  serialized[offset++] = PROTOCOL_VERSION;

  // Nonce (24 bytes)
  serialized.set(nonce, offset);
  offset += 24;

  // Sender public key (32 bytes)
  serialized.set(senderPublicKey, offset);
  offset += 32;

  // Encrypted payload
  serialized.set(encryptedPayload, offset);

  return serialized;
}

/**
 * Deserialize encrypted message from Nahan Compact Protocol format
 */
export function deserializeEncryptedMessage(data: Uint8Array): {
  version: number;
  nonce: Uint8Array;
  senderPublicKey: Uint8Array;
  encryptedPayload: Uint8Array;
} {
  if (data.length < 1 + 24 + 32) {
    throw new Error('Invalid message format: too short');
  }

  let offset = 0;

  // Version byte
  const version = data[offset++];
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version}`);
  }

  // Nonce (24 bytes)
  const nonce = data.slice(offset, offset + 24);
  offset += 24;

  // Sender public key (32 bytes)
  const senderPublicKey = data.slice(offset, offset + 32);
  offset += 32;

  // Encrypted payload
  const encryptedPayload = data.slice(offset);

  return { version, nonce, senderPublicKey, encryptedPayload };
}

/**
 * Serialize signed message in Nahan Compact Protocol format
 * Format: [Version (1)] [Sender Public Key (32)] [Signature (64)] [Message Bytes]
 */
export function serializeSignedMessage(
  senderPublicKey: Uint8Array,
  signature: Uint8Array,
  messageBytes: Uint8Array,
): Uint8Array {
  const totalLength = 1 + 32 + 64 + messageBytes.length;
  const serialized = new Uint8Array(totalLength);
  let offset = 0;

  // Version byte (use 0x02 for signed broadcast messages)
  serialized[offset++] = SIGNED_PROTOCOL_VERSION;

  // Sender public key (32 bytes)
  serialized.set(senderPublicKey, offset);
  offset += 32;

  // Signature (64 bytes)
  serialized.set(signature, offset);
  offset += 64;

  // Message bytes
  serialized.set(messageBytes, offset);

  return serialized;
}

/**
 * Deserialize signed message from Nahan Compact Protocol format
 */
export function deserializeSignedMessage(data: Uint8Array): {
  version: number;
  senderPublicKey: Uint8Array;
  signature: Uint8Array;
  messageBytes: Uint8Array;
} {
  if (data.length < 1 + 32 + 64) {
    throw new Error('Invalid signed message format: too short');
  }

  let offset = 0;

  // Version byte
  const version = data[offset++];
  if (version !== SIGNED_PROTOCOL_VERSION) {
    throw new Error(`Unsupported signed message version: ${version}`);
  }

  // Sender public key (32 bytes)
  const senderPublicKey = data.slice(offset, offset + 32);
  offset += 32;

  // Signature (64 bytes)
  const signature = data.slice(offset, offset + 64);
  offset += 64;

  // Message bytes
  const messageBytes = data.slice(offset);

  return { version, senderPublicKey, signature, messageBytes };
}
