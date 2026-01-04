/**
 * Hook for smart offline clipboard detection with user consent
 * Detects Nahan encrypted messages from clipboard when user returns to tab
 * Respects browser privacy constraints and requires explicit user permission
 */

import { useEffect, useState } from 'react';
import { CamouflageService } from '../services/camouflage';
import * as naclUtil from 'tweetnacl-util';
import { useAppStore } from '../stores/appStore';
import { detectPacketType, parseStealthID } from '../services/stealthId';
import { CryptoService } from '../services/crypto';

const camouflageService = CamouflageService.getInstance();
const cryptoService = CryptoService.getInstance();

type PermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

interface ClipboardPermissionStatus {
  state: PermissionState;
  canRequest: boolean;
}

/**
 * Check clipboard permission status
 * Uses navigator.permissions.query if available, otherwise checks by attempting to read
 */
export function useClipboardPermission(): ClipboardPermissionStatus {
  const [permissionState, setPermissionState] = useState<PermissionState>('unsupported');

  useEffect(() => {
    // Check if clipboard API is supported
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      setPermissionState('unsupported');
      return;
    }

    // Check permission status using Permissions API
    const checkPermission = async () => {
      try {
        // Try to query permission status
        // Note: 'clipboard-read' permission name may not be supported in all browsers
        // Some browsers require user gesture to check permission
        if ('permissions' in navigator && 'query' in navigator.permissions) {
          try {
            const result = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
            setPermissionState(result.state as PermissionState);

            // Listen for permission changes
            result.onchange = () => {
              setPermissionState(result.state as PermissionState);
            };
          } catch (permError) {
            // Permissions API might not support 'clipboard-read' name
            // Fallback: assume prompt state (will be determined on first read attempt)
            setPermissionState('prompt');
          }
        } else {
          // Permissions API not available - assume prompt state
          setPermissionState('prompt');
        }
      } catch (error) {
        // Fallback: assume prompt state
        setPermissionState('prompt');
      }
    };

    checkPermission();
  }, []);

  return {
    state: permissionState,
    canRequest: permissionState === 'prompt' || permissionState === 'denied',
  };
}

/**
 * Request clipboard read permission by attempting to read clipboard
 * This manual gesture is required by browsers to initiate the permission prompt
 */
export async function requestClipboardPermission(): Promise<boolean> {
  try {
    // Attempt to read clipboard - this will trigger permission prompt if not granted
    await navigator.clipboard.readText();
    return true;
  } catch (error: any) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return false;
    }
    // Other errors (e.g., clipboard empty) are okay - permission was granted
    return true;
  }
}

/**
 * Extract sender public key from encrypted message
 * Works with both stealth (ZWC) and direct Nahan Compact Protocol messages
 * Format: [Version (1)] [Nonce (24)] [Sender Public Key (32)] [Encrypted Payload]
 */
function extractSenderPublicKey(encryptedData: Uint8Array): string | null {
  try {
    // Deserialize Nahan Compact Protocol message
    if (encryptedData.length < 1 + 24 + 32) {
      return null;
    }

    // Version byte is at offset 0
    // Nonce is at offset 1-24 (24 bytes)
    // Sender public key is at offset 25-56 (32 bytes)
    const senderPublicKey = encryptedData.slice(25, 57);

    // Convert to base64 for storage/comparison
    return naclUtil.encodeBase64(senderPublicKey);
  } catch (error) {
    console.error('Failed to extract sender public key:', error);
    return null;
  }
}

/**
 * Compare two public keys byte by byte
 * Returns true if keys match exactly
 */
function comparePublicKeys(key1Base64: string, key2Base64: string): boolean {
  try {
    const key1 = naclUtil.decodeBase64(key1Base64);
    const key2 = naclUtil.decodeBase64(key2Base64);

    if (key1.length !== key2.length) return false;

    for (let i = 0; i < key1.length; i++) {
      if (key1[i] !== key2[i]) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Detection result for clipboard content
 */
export interface DetectionResult {
  type: 'id' | 'message';
  contactName: string;
  contactPublicKey?: string; // For ID type
  contactFingerprint?: string; // For message type
  encryptedData?: string; // Base64-encoded encrypted message (for message type)
}

/**
 * Check clipboard for Nahan messages or IDs when window gains focus
 * Only runs if permission is granted
 * Returns detection result or null if nothing detected
 */
export function useClipboardDetection(
  enabled: boolean,
  onDetection: (result: DetectionResult) => void
) {
  const { contacts, identity, sessionPassphrase } = useAppStore();
  const [lastCheckedClipboard, setLastCheckedClipboard] = useState<string>('');

  useEffect(() => {
    if (!enabled) return;

    const checkClipboard = async () => {
      try {
        // Read clipboard content
        const clipboardText = await navigator.clipboard.readText();

        // Skip if we already checked this content
        if (clipboardText === lastCheckedClipboard) {
          return;
        }

        // Check if it's a Nahan stealth message (ZWC-embedded)
        if (camouflageService.hasZWC(clipboardText)) {
          try {
            // Decode stealth message
            const binary = camouflageService.decodeFromZWC(clipboardText, true); // Use lenient mode for auto-detection

            // Detect packet type
            const packetType = detectPacketType(binary);

            if (packetType === 'id') {
              // Parse stealth ID
              const idData = parseStealthID(binary);
              if (idData) {
                // Check if this is the user's own identity
                // Compare the detected public key with the user's identity fingerprint
                if (identity) {
                  try {
                    // Generate fingerprint from the detected public key
                    const detectedFingerprint = await cryptoService.getFingerprint(idData.publicKey);

                    // Compare with user's own fingerprint
                    if (detectedFingerprint === identity.fingerprint) {
                      // This is the user's own identity - silently ignore
                      console.debug('Clipboard detection: Ignoring own identity');
                      return;
                    }
                  } catch (error) {
                    // If fingerprint generation fails, proceed with detection (fail-safe)
                    console.debug('Failed to generate fingerprint for comparison:', error);
                  }
                }

                // Not the user's own identity - proceed with detection
                setLastCheckedClipboard(clipboardText);
                onDetection({
                  type: 'id',
                  contactName: idData.name,
                  contactPublicKey: idData.publicKey,
                });
                return;
              }
            } else if (packetType === 'message') {
              // Extract sender public key for message
              const senderPublicKey = extractSenderPublicKey(binary);

              if (senderPublicKey) {
                // Cross-reference with contacts
                const matchingContact = contacts.find(contact =>
                  comparePublicKeys(contact.publicKey, senderPublicKey)
                );

                if (matchingContact && identity && sessionPassphrase) {
                  // Convert to base64 for the modal
                  const encryptedData = naclUtil.encodeBase64(binary);
                  setLastCheckedClipboard(clipboardText);
                  onDetection({
                    type: 'message',
                    contactName: matchingContact.name,
                    contactFingerprint: matchingContact.fingerprint,
                    encryptedData: encryptedData,
                  });
                  return;
                } else {
                  // Unknown sender - could show notification but don't auto-import
                  console.debug('Nahan message detected from unknown sender');
                }
              }
            }
          } catch (error) {
            // Not a valid Nahan message or extraction failed
            console.debug('Failed to extract Nahan message from clipboard:', error);
          }
        } else {
          // Check if it's a direct Nahan Compact Protocol message (base64)
          try {
            const decoded = naclUtil.decodeBase64(clipboardText.trim());
            if (decoded.length > 0 && decoded[0] === 0x01) {
              // Nahan Compact Protocol message detected
              const senderPublicKey = extractSenderPublicKey(decoded);

              if (senderPublicKey) {
                // Cross-reference with contacts
                const matchingContact = contacts.find(contact =>
                  comparePublicKeys(contact.publicKey, senderPublicKey)
                );

                if (matchingContact && identity && sessionPassphrase) {
                  setLastCheckedClipboard(clipboardText);
                  onDetection({
                    type: 'message',
                    contactName: matchingContact.name,
                    contactFingerprint: matchingContact.fingerprint,
                    encryptedData: clipboardText.trim(),
                  });
                  return;
                }
              }
            }
          } catch {
            // Not base64 or not a Nahan message
          }
        }
      } catch (error: any) {
        // Permission denied or clipboard empty - silently ignore
        if (error.name !== 'NotAllowedError' && error.name !== 'SecurityError') {
          console.debug('Clipboard check failed:', error);
        }
      }
    };

    // Check clipboard when window gains focus
    const handleFocus = () => {
      checkClipboard();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, contacts, identity, sessionPassphrase, onDetection, lastCheckedClipboard]);
}

