/**
 * Hook for smart offline clipboard detection with user consent
 * Detects Nahan encrypted messages from clipboard when user returns to tab
 * Respects browser privacy constraints and requires explicit user permission
 * Uses unified handleUniversalInput for all detection logic
 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/appStore';

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
            // Permissions API might not support 'clipboard-read' name (e.g. Firefox)
            // In this case, we mark as unsupported to avoid prompting users
            // where background clipboard reading is not possible
            setPermissionState('unsupported');
          }
        } else {
          // Permissions API not available - assume unsupported
          setPermissionState('unsupported');
        }
      } catch (error) {
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
  } catch (error: any) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
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
  const { handleUniversalInput, identity } = useAppStore();
  const [lastCheckedClipboard, setLastCheckedClipboard] = useState<string>('');

  // SYNC BLOCKING: Use ref to track last processed clipboard text synchronously
  // This prevents the "quick re-open" loop by blocking re-detection within the same event cycle
  const lastProcessedRef = useRef<string>('');

  useEffect(() => {
    if (!enabled) return;

    const checkClipboard = async () => {
      try {
        // Read clipboard content
        const clipboardText = await navigator.clipboard.readText();

        // DEDUPLICATION: Clear tracking if clipboard is empty
        // This allows re-detection if clipboard was cleared and refilled with the same text
        if (!clipboardText || clipboardText.trim().length === 0) {
          if (lastProcessedRef.current) {
            lastProcessedRef.current = '';
            setLastCheckedClipboard('');
          }
          return;
        }

        // SYNC BLOCKING: Check ref first to prevent re-detection in same event cycle
        // Skip if we already processed this exact content synchronously
        if (clipboardText === lastProcessedRef.current) {
          return;
        }

        // Also check state for async deduplication
        if (clipboardText === lastCheckedClipboard) {
          return;
        }

        // SYNC BLOCKING: Update ref immediately before calling handleUniversalInput
        // This synchronously blocks re-detection within the same event cycle
        lastProcessedRef.current = clipboardText;

        // Use unified handleUniversalInput for all detection
        // skipNavigation=true to avoid auto-navigation on clipboard detection
        try {
          const result = await handleUniversalInput(clipboardText, undefined, true);

          // CRITICAL: Always trigger UI modals when a message is detected
          // handleUniversalInput already stored the message, so we just need to notify the UI
          // Call onNewMessage IMMEDIATELY after handleUniversalInput succeeds
          if (result && result.type === 'message') {
            console.log('[Detector] Message detected, signaling App.tsx', result);
            // Call onNewMessage for the new unified modal (primary) - IMMEDIATELY
            if (onNewMessage) {
              onNewMessage(result);
            } else {
              console.warn('[Detector] onNewMessage callback not provided');
            }

            // Also call onDetection for backward compatibility with DetectionModal
            // This ensures both modals can be triggered if needed
            if (onDetection) {
              const { contacts } = useAppStore.getState();
              const sender = contacts.find(c => c.fingerprint === result.fingerprint);
              if (sender) {
                // Use clipboard text as encryptedData (it's already processed by handleUniversalInput)
                // The DetectionModal will handle it appropriately
                onDetection({
                  type: 'message',
                  contactName: result.senderName,
                  contactFingerprint: result.fingerprint,
                  encryptedData: clipboardText.trim(),
                });
              }
            }
          }

          // Update last checked clipboard to prevent duplicate processing
          setLastCheckedClipboard(clipboardText);
        } catch (error: any) {
          // STRICT ERROR HANDLING: Update ref for ALL known errors to prevent looping
          // This ensures that even "invalid" text is marked as processed
          lastProcessedRef.current = clipboardText;

          // Handle specific errors silently (they're expected)
          if (error.message === 'DUPLICATE_MESSAGE') {
            // Duplicate message - silently ignore
            setLastCheckedClipboard(clipboardText);
            return;
          } else if (error.message === 'SENDER_UNKNOWN') {
            // Unknown sender - mark as processed to prevent loop
            setLastCheckedClipboard(clipboardText);
            console.debug('[UniversalInput] Unknown sender detected in clipboard');
            return;
          } else if (error.message === 'CONTACT_INTRO_DETECTED') {
            // CRITICAL: Handle CONTACT_INTRO_DETECTED - map to DetectionResult and call onDetection
            console.log('[Detector] Contact intro detected, signaling App.tsx');
            if (onDetection && error.keyData) {
              // Map error.keyData to DetectionResult format
              // Support both formats: { name, publicKey } and { username, key }
              const contactName = error.keyData.name || error.keyData.username || 'Unknown';
              const contactPublicKey = error.keyData.publicKey || error.keyData.key;

              if (contactPublicKey) {
                onDetection({
                  type: 'id',
                  contactName: contactName,
                  contactPublicKey: contactPublicKey,
                });
              } else {
                console.warn('[Detector] CONTACT_INTRO_DETECTED missing public key');
              }
            } else {
              console.warn('[Detector] onDetection callback not provided or keyData missing');
            }
            // Mark as processed to prevent loop
            setLastCheckedClipboard(clipboardText);
            return;
          } else if (error.message === 'Authentication required') {
            // App is locked - mark as processed to prevent loop
            setLastCheckedClipboard(clipboardText);
            return;
          } else {
            // Other errors (invalid format, etc.) - mark as processed to prevent loop
            // This is expected for non-Nahan clipboard content
            setLastCheckedClipboard(clipboardText);
            console.debug('[UniversalInput] Clipboard content is not a Nahan message:', error.message);
          }
        }
      } catch (error: any) {
        // Permission denied or clipboard empty - silently ignore
        if (error.name !== 'NotAllowedError' && error.name !== 'SecurityError') {
          console.debug('[UniversalInput] Clipboard check failed:', error);
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
  }, [enabled, handleUniversalInput, identity, lastCheckedClipboard, onDetection, onNewMessage]);
}

