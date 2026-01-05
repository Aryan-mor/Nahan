/* eslint-disable max-lines-per-function */
import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  threshold?: number; // milliseconds
  preventDefault?: boolean;
}

/**
 * Custom hook for detecting long press/long click gestures
 * Works for both mouse (long click) and touch (long press) events
 *
 * @param options Configuration object
 * @returns Event handlers for React components
 */
export function useLongPress({
  onLongPress,
  onClick,
  threshold = 500,
  preventDefault = true,
}: UseLongPressOptions) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }

      isLongPressRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onLongPress();
      }, threshold);
    },
    [onLongPress, threshold, preventDefault]
  );

  const end = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      const wasLongPress = isLongPressRef.current;
      isLongPressRef.current = false;

      // If it was a long press, don't trigger click
      if (wasLongPress) {
        return;
      }

      // Otherwise, trigger click handler
      if (onClick) {
        onClick();
      }
    },
    [onClick, preventDefault]
  );

  const cancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isLongPressRef.current = false;
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: end,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: end,
    onTouchCancel: cancel,
  };
}

