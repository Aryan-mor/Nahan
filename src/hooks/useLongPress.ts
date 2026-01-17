/* eslint-disable max-lines-per-function */
import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void;
  onClick?: () => void;
  threshold?: number; // milliseconds
  shouldPreventDefault?: boolean;
}

/**
 * Custom hook for detecting long press/long click gestures
 * Optimized for scrolling lists (cancels on scroll/move)
 */
export function useLongPress({
  onLongPress,
  onClick,
  threshold = 500,
  shouldPreventDefault = true,
}: UseLongPressOptions) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  // Track start position to allow small movement (jitter) but cancel on scroll
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isLongPressRef.current = false;
    startPosRef.current = null;
  }, []); // Added correct dependency array

  const start = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Don't prevent default here to allow scrolling to start
      // e.preventDefault();
      // e.stopPropagation();

      isLongPressRef.current = false;

      if ('touches' in e) {
        startPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else {
        startPosRef.current = { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
      }

      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        if (shouldPreventDefault && e.target) {
            // Try to prevent context menu if possible, but it might be too late
        }
        onLongPress(e);
      }, threshold);
    },
    [onLongPress, threshold, shouldPreventDefault]
  );

  const move = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (longPressTimerRef.current && startPosRef.current) {
        let clientX, clientY;
        if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          // Mouse move
          return; // Ignore mouse move for now, usually fine
        }

        const dx = Math.abs(clientX - startPosRef.current.x);
        const dy = Math.abs(clientY - startPosRef.current.y);

        // If moved more than 10px, assume scrolling and cancel long press
        if (dx > 10 || dy > 10) {
           cancel();
        }
      }
    },
    [cancel]
  );

  const end = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Clear timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      const wasLongPress = isLongPressRef.current;
      isLongPressRef.current = false;
      startPosRef.current = null;

      // If it was a long press, prevent click if possible and return
      if (wasLongPress) {
        if (shouldPreventDefault) {
          e.preventDefault();
        }
        return;
      }

      // Otherwise, trigger click handler
      if (onClick) {
        onClick();
      }
    },
    [onClick, shouldPreventDefault] // Added shouldPreventDefault dependency
  );



  return {
    onMouseDown: start,
    onMouseUp: end,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: end,
    onTouchMove: move, // Critical for scroll cancellation
    onTouchCancel: cancel,
  };
}
