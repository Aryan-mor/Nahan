/* eslint-disable max-lines-per-function */
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useHelpStore } from '../../store/useHelpStore';
import { useUIStore } from '../../stores/uiStore';
import * as logger from '../../utils/logger';
import { getTourSteps } from './tourConfig';

// We need to inject the icon HTML string since driver.js takes string content
// But we want to use lucide icons. We can render them to static markup first?
// Or just let driver.js handle the structure and we style it.
// Actually, standard driver.js popovers are string HTML.
// For advanced React usage, we can use onHighlightStarted to portal, but that's complex.
// Let's stick to clean HTML string injection for now, it's robust and simple.

export const TourGuide = () => {
  const { t } = useTranslation();
  const { activeHelpTopic, endHelpTopic } = useHelpStore();
  const { isLocked } = useUIStore();

  const driverObj = useRef<ReturnType<typeof driver> | null>(null);

  // Detect mobile view (matches md breakpoint in Tailwind)
  const isMobile = window.innerWidth < 768;

  // Define steps for each topic

  const getSteps = useCallback((topic: string | null): DriveStep[] => {
      return getTourSteps(topic || 'onboarding', t, driverObj, isMobile);
  }, [t, isMobile]);

  useEffect(() => {
    // Only start tour when manually triggered via Help Modal
    // No automatic onboarding tour on first use

    const shouldStartTopic = !!activeHelpTopic && !isLocked;

    if (!shouldStartTopic) {
        // If we are not supposed to be running, ensure driver is destroyed
        if (driverObj.current) {
            driverObj.current.destroy();
            driverObj.current = null;
        }
        return;
    }

    const steps = getSteps(activeHelpTopic);

    // Initialize driver with INTERACTION ENABLED
    driverObj.current = driver({
      showProgress: steps.length > 1,
      animate: true,
      allowClose: true,
      // CRITICAL: Allow user to click the elements!
      disableActiveInteraction: false,

      doneBtnText: t('tour.done', 'Got it!'),
      nextBtnText: t('tour.next', 'Next'),
      prevBtnText: t('tour.prev', 'Back'),
      onDestroyed: () => {
        endHelpTopic();
        logger.info('[Tour] Completed');
      },
      popoverClass: 'nahan-driver-popover theme-dark bg-industrial-900 text-industrial-100 border border-industrial-700 shadow-xl rounded-xl',
      steps: steps
    });


    // Start the tour
    const timer = setTimeout(() => {
        driverObj.current?.drive();
    }, 500);

    return () => {
        clearTimeout(timer);
        driverObj.current?.destroy();
    };

  }, [isLocked, activeHelpTopic, t, endHelpTopic, getSteps]);

  // CSS for driver.js overrides to match Nahan theme
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .driver-popover.nahan-driver-popover {
        background-color: #0f1115; /* industrial-900 */
        color: #e3e5e8; /* industrial-100 */
        border: 1px solid #282f3a; /* industrial-700 */
        font-family: inherit;
      }
      .driver-popover.nahan-driver-popover .driver-popover-title {
        font-weight: 700;
        font-size: 1.125rem;
        color: #e3e5e8;
        margin-bottom: 0.5rem;
      }
      .driver-popover.nahan-driver-popover .driver-popover-description {
        color: #9ca3af; /* industrial-300 */
        font-size: 0.875rem;
        line-height: 1.5;
      }
      .driver-popover.nahan-driver-popover button {
        background-color: #1f242d; /* industrial-800 */
        color: #e3e5e8;
        border: 1px solid #374151; /* industrial-700 */
        border-radius: 6px;
        text-shadow: none;
        padding: 6px 12px;
        font-size: 0.8rem;
      }
      .driver-popover.nahan-driver-popover button:hover {
        background-color: #374151; /* industrial-700 */
        color: white;
      }
      .driver-popover.nahan-driver-popover .driver-popover-navigation-btns {
        justify-content: flex-end;
        gap: 8px;
      }
      .driver-popover.nahan-driver-popover .driver-popover-close-btn {
        color: #9ca3af;
      }
      .driver-popover.nahan-driver-popover .driver-popover-close-btn:hover {
        color: #e3e5e8;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return null; // Logic-only component
};
