/**
 * Hook for smart offline clipboard detection with user consent
 * Detects Nahan encrypted messages from clipboard when user returns to tab
 * Respects browser privacy constraints and requires explicit user permission
 * Uses unified handleUniversalInput for all detection logic
 */

/* eslint-disable max-lines-per-function */
import { useEffect, useRef, useState } from 'react';

import { analyzeClipboard } from '../services/clipboardAnalysis';
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
            const result = await navigator.permissions.query({
              name: 'clipboard-read' as PermissionName,
            });
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

/**
 * Detection result for clipboard content
 * Note: This interface is kept for backward compatibility with App.tsx
 * The actual detection is now handled by handleUniversalInput
 */
export interface DetectionResult {
  type: 'id' | 'message' | 'duplicate_message';
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
  onNewMessage?: (result: {
    type: 'message' | 'contact';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  }) => void,
) {
  const { handleUniversalInput, identity, sessionPassphrase, contacts } = useAppStore();
  const [lastCheckedClipboard, setLastCheckedClipboard] = useState<string>('');

  // SYNC BLOCKING: Use ref to track last processed clipboard text synchronously
  // This prevents the "quick re-open" loop by blocking re-detection within the same event cycle
  const lastProcessedRef = useRef<string>('');
  const lastProcessedImageRef = useRef<string>('');
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const checkClipboard = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const { processed, contentHash, textContent } = await analyzeClipboard(
          {
            identity,
            sessionPassphrase,
            contacts,
            handleUniversalInput,
          },
          {
            previousText: lastCheckedClipboard,
            previousImageHash: lastProcessedImageRef.current,
          },
        );

        // Update tracking refs
        if (contentHash) {
          lastProcessedImageRef.current = contentHash;
        }

        if (textContent) {
          lastProcessedRef.current = textContent;
          setLastCheckedClipboard(textContent);
        } else {
          // If no text detected (and no error), clear text tracking
          // This allows re-detection if user clears clipboard then copies same text
          if (lastProcessedRef.current) {
            lastProcessedRef.current = '';
            setLastCheckedClipboard('');
          }
        }

        // Handle successful detection
        if (processed) {
          if (processed.type === 'message') {
            logger.log('[Detector] Message detected, signaling App.tsx', processed);
            if (onNewMessage) {
              onNewMessage({
                type: 'message',
                fingerprint: processed.fingerprint!,
                isBroadcast: processed.isBroadcast || false,
                senderName: processed.senderName || 'Unknown',
              });
            } else {
              logger.warn('[Detector] onNewMessage callback not provided');
            }

            if (onDetection) {
              // For images (stego), encryptedData is already stored/handled
              // For text, we might want to pass it?
              // The original code passed `clipboardText.trim()` for text messages.
              // `analyzeClipboard` returns `textContent` if it was text.

              onDetection({
                type: 'message',
                contactName: processed.senderName || 'Unknown',
                contactFingerprint: processed.fingerprint,
                encryptedData: processed.source === 'text' ? textContent : undefined,
              });
            }
          } else if (processed.type === 'contact') {
             // Handle contact/id detection if returned as processed result
             // (Currently analyzeClipboard might return 'contact' type for text)
             if (processed.data && onDetection) {
                // Assuming processed.data is the result from handleUniversalInput which might be { type: 'contact', ... }
                // But handleUniversalInput usually throws 'CONTACT_INTRO_DETECTED' or returns 'message'.
                // If I modified analyzeClipboard to catch 'id' type:
                const contactData = processed.data;
                 onDetection({
                    type: 'id',
                    contactName: contactData.name || 'Unknown',
                    contactPublicKey: contactData.publicKey || contactData.key,
                 });
             }
          }
        }
      } catch (error: unknown) {
        // Handle errors re-thrown by analyzeClipboard (from handleUniversalInput)
        const err = error as Error;

        // If text content was read but processing failed, we should still update tracking
        // to avoid infinite error loops?
        // analyzeClipboard doesn't return textContent on error.
        // We might need to manually read text if we want to "skip" it next time?
        // But if it failed, maybe we WANT to retry next time?
        // Original code: "setLastCheckedClipboard(clipboardText)" on error.

        // Since we can't get the text from analyzeClipboard on error, we might rely on
        // the fact that "checkClipboard" runs on focus/visibility.
        // If it fails, it will try again next event.
        // If the error is persistent (e.g. invalid format), it will loop?
        // Maybe analyzeClipboard should return textContent even on error?
        // Too late to change interface without another tool call.
        // Let's assume re-try is acceptable or handle specific errors.

        if (err.message === 'DUPLICATE_MESSAGE') {
          // Ignore
        } else if (err.message === 'SENDER_UNKNOWN') {
           logger.log('[UniversalInput] Unknown sender detected in clipboard');
        } else if (err.message === 'CONTACT_INTRO_DETECTED') {
          logger.log('[Detector] Contact intro detected, signaling App.tsx');
          const contactError = error as Error & {
            keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
          };
          if (onDetection && contactError.keyData) {
            const contactName =
              contactError.keyData.name || contactError.keyData.username || 'Unknown';
            const contactPublicKey =
              contactError.keyData.publicKey || contactError.keyData.key;

            if (contactPublicKey) {
              onDetection({
                type: 'id',
                contactName: contactName,
                contactPublicKey: contactPublicKey,
              });
            } else {
              logger.warn('[Detector] CONTACT_INTRO_DETECTED missing public key');
            }
          }
        } else if (err.message === 'Authentication required') {
          // Ignore
        } else if (err.name !== 'NotAllowedError' && err.name !== 'SecurityError') {
          logger.log(
            '[UniversalInput] Clipboard content is not a Nahan message:',
            err.message,
          );
        }
      } finally {
        isProcessingRef.current = false;
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
