/**
 * Hook for smart offline clipboard detection with user consent
 * Detects Nahan encrypted messages from clipboard when user returns to tab
 * Respects browser privacy constraints and requires explicit user permission
 * Uses unified handleUniversalInput for all detection logic
 */

/* eslint-disable max-lines-per-function, max-lines */
import { useEffect, useRef, useState } from 'react';

import { steganographyService } from '../services/steganography';
import { storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import * as logger from '../utils/logger';

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
          } catch {
            // Permissions API might not support 'clipboard-read' name (e.g. Firefox)
            // In this case, we mark as unsupported to avoid prompting users
            // where background clipboard reading is not possible
            setPermissionState('unsupported');
          }
        } else {
          // Permissions API not available - assume unsupported
          setPermissionState('unsupported');
        }
      } catch {
        // Fallback: assume unsupported on error
        setPermissionState('unsupported');
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
  } catch (error: unknown) {
    const err = error as Error;
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return false;
    }
    // Other errors (e.g., clipboard empty) are okay - permission was granted
    return true;
  }
}

// Helper to hash blob for deduplication
const getImageHash = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  const view = new Uint8Array(buffer);
  // Simple hash: length + sum of first 100 bytes + sum of last 100 bytes
  let sum = 0;
  for (let i = 0; i < Math.min(100, view.length); i++) sum += view[i];
  for (let i = Math.max(0, view.length - 100); i < view.length; i++) sum += view[i];
  return `${blob.size}-${blob.type}-${sum}`;
};

// Helper to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Detection result for clipboard content
 * Note: This interface is kept for backward compatibility with App.tsx
 * The actual detection is now handled by handleUniversalInput
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
 * Uses unified handleUniversalInput for all detection logic
 * Returns result object for UI to show modal
 */
export function useClipboardDetection(
  enabled: boolean,
  onDetection: (result: DetectionResult) => void,
  onNewMessage?: (result: { type: 'message' | 'contact'; fingerprint: string; isBroadcast: boolean; senderName: string }) => void
) {
  const { handleUniversalInput, identity, sessionPassphrase, contacts } = useAppStore();
  const [lastCheckedClipboard, setLastCheckedClipboard] = useState<string>('');

  // SYNC BLOCKING: Use ref to track last processed clipboard text synchronously
  // This prevents the "quick re-open" loop by blocking re-detection within the same event cycle
  const lastProcessedRef = useRef<string>('');
  const lastProcessedImageRef = useRef<string>('');

  useEffect(() => {
    if (!enabled) return;

    const checkClipboard = async () => {
      try {
        // Read clipboard content
        let clipboardText = '';
        try {
          clipboardText = await navigator.clipboard.readText();
        } catch {
          // Ignore readText errors (might be image only)
        }

        // DEDUPLICATION: Clear tracking if clipboard is empty
        // This allows re-detection if clipboard was cleared and refilled with the same text
        if (!clipboardText || clipboardText.trim().length === 0) {
          if (lastProcessedRef.current) {
            lastProcessedRef.current = '';
            setLastCheckedClipboard('');
          }
          // Fall through to check image
        } else {
          // SYNC BLOCKING: Check ref first to prevent re-detection in same event cycle
          // Skip if we already processed this exact content synchronously
          if (clipboardText !== lastProcessedRef.current && clipboardText !== lastCheckedClipboard) {
            
            // SYNC BLOCKING: Update ref immediately before calling handleUniversalInput
            lastProcessedRef.current = clipboardText;

            // Use unified handleUniversalInput for all detection
            try {
              const result = await handleUniversalInput(clipboardText, undefined, true);

              // CRITICAL: Always trigger UI modals when a message is detected
              if (result && result.type === 'message') {
                logger.log('[Detector] Message detected, signaling App.tsx', result);
                if (onNewMessage) {
                  onNewMessage(result);
                } else {
                  logger.warn('[Detector] onNewMessage callback not provided');
                }

                if (onDetection) {
                  const { contacts } = useAppStore.getState();
                  const sender = contacts.find(c => c.fingerprint === result.fingerprint);
                  if (sender) {
                    onDetection({
                      type: 'message',
                      contactName: result.senderName,
                      contactFingerprint: result.fingerprint,
                      encryptedData: clipboardText.trim(),
                    });
                  }
                }
              }

              setLastCheckedClipboard(clipboardText);
            } catch (error: unknown) {
              const err = error as Error;
              lastProcessedRef.current = clipboardText;

              if (err.message === 'DUPLICATE_MESSAGE') {
                setLastCheckedClipboard(clipboardText);
              } else if (err.message === 'SENDER_UNKNOWN') {
                setLastCheckedClipboard(clipboardText);
                logger.log('[UniversalInput] Unknown sender detected in clipboard');
              } else if (err.message === 'CONTACT_INTRO_DETECTED') {
                logger.log('[Detector] Contact intro detected, signaling App.tsx');
                const contactError = error as Error & {
                  keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
                };
                if (onDetection && contactError.keyData) {
                  const contactName = contactError.keyData.name || contactError.keyData.username || 'Unknown';
                  const contactPublicKey = contactError.keyData.publicKey || contactError.keyData.key;

                  if (contactPublicKey) {
                    onDetection({
                      type: 'id',
                      contactName: contactName,
                      contactPublicKey: contactPublicKey,
                    });
                  } else {
                    logger.warn('[Detector] CONTACT_INTRO_DETECTED missing public key');
                  }
                } else {
                  logger.warn('[Detector] onDetection callback not provided or keyData missing');
                }
                setLastCheckedClipboard(clipboardText);
              } else if (err.message === 'Authentication required') {
                setLastCheckedClipboard(clipboardText);
              } else {
                setLastCheckedClipboard(clipboardText);
                logger.log('[UniversalInput] Clipboard content is not a Nahan message:', err.message);
              }
            }
          }
        }

        // Image Detection Logic
        if (navigator.clipboard.read) {
          try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
              const imageType = item.types.find(t => t.startsWith('image/'));
              if (imageType) {
                const blob = await item.getType(imageType);
                const hash = await getImageHash(blob);

                if (hash === lastProcessedImageRef.current) continue;
                lastProcessedImageRef.current = hash;

                if (identity && sessionPassphrase) {
                  try {
                    const file = new File([blob], "clipboard_image", { type: blob.type });
                    const result = await steganographyService.decode(
                      file,
                      identity.privateKey,
                      sessionPassphrase,
                      contacts.map(c => c.publicKey)
                    );

                    if (result.senderPublicKey) {
                      const sender = contacts.find(c => c.publicKey === result.senderPublicKey);
                      if (sender) {
                        const base64 = await blobToBase64(blob);
                        
                        await storageService.storeMessage({
                          senderFingerprint: sender.fingerprint,
                          recipientFingerprint: identity.fingerprint,
                          content: {
                            plain: '',
                            encrypted: '',
                            image: base64
                          },
                          type: 'image_stego',
                          isOutgoing: false,
                          read: false,
                          isVerified: true,
                          status: 'sent'
                        }, sessionPassphrase);

                        logger.log('[Detector] Stego Image detected and stored');

                        if (onNewMessage) {
                          onNewMessage({
                            type: 'message',
                            fingerprint: sender.fingerprint,
                            isBroadcast: false,
                            senderName: sender.name
                          });
                        }
                        
                        // Also trigger legacy detection modal for visual feedback
                        if (onDetection) {
                          onDetection({
                             type: 'message',
                             contactName: sender.name,
                             contactFingerprint: sender.fingerprint,
                             encryptedData: 'image_stego'
                          });
                        }
                      } else {
                        logger.log('[Detector] Stego Image detected but sender unknown');
                      }
                    }
                  } catch (_e) {
                    // Not a valid stego image or decode failed
                    // logger.log('Image decode failed (not stego?)', e);
                  }
                }
              }
            }
          } catch (_e) {
            // Ignore clipboard read errors
          }
        }

      } catch (error: unknown) {
        // Permission denied or clipboard empty - silently ignore
        const err = error as Error;
        if (err.name !== 'NotAllowedError' && err.name !== 'SecurityError') {
          logger.log('[UniversalInput] Clipboard check failed:', err);
        }
      }
    };

    // IMMEDIATE CHECK: Call checkClipboard() immediately when enabled becomes true
    // This ensures that as soon as the app is unlocked (PIN entered), the clipboard is processed
    checkClipboard();

    // Check clipboard when window gains focus
    const handleFocus = () => {
      // SECURITY: Only check clipboard if the document is focused to avoid background data access flags
      if (document.hasFocus()) {
        checkClipboard();
      }
    };

    // ENHANCED REACTIVITY: Listen for visibilitychange
    // When document becomes visible, trigger checkClipboard()
    // This makes detection feel like a "state change" when switching apps
    const handleVisibilityChange = () => {
      // SECURITY: Ensure document is visible and focused before reading clipboard
      if (document.visibilityState === 'visible') {
        // Optional: Add a small delay or check user activation if possible in the future
        checkClipboard();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, handleUniversalInput, identity, lastCheckedClipboard, onDetection, onNewMessage]);
}
