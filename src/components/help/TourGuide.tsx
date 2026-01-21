/* eslint-disable max-lines-per-function */
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useHelpStore } from '../../store/useHelpStore';
import { useAppStore } from '../../stores/appStore';
import { useUIStore } from '../../stores/uiStore';
import * as logger from '../../utils/logger';

// We need to inject the icon HTML string since driver.js takes string content
// But we want to use lucide icons. We can render them to static markup first?
// Or just let driver.js handle the structure and we style it.
// Actually, standard driver.js popovers are string HTML.
// For advanced React usage, we can use onHighlightStarted to portal, but that's complex.
// Let's stick to clean HTML string injection for now, it's robust and simple.

export const TourGuide = () => {
  const { t } = useTranslation();
  const { hasSeenOnboarding, setHasSeenOnboarding } = useHelpStore();
  const { identity } = useAppStore();
  const { isLocked } = useUIStore();

  const driverObj = useRef<ReturnType<typeof driver> | null>(null);

  useEffect(() => {
    // Only start tour if:
    // 1. Not seen onboarding yet (or explicitly reset)
    // 2. User has created an identity (logged in)
    // 3. App is NOT locked
    // 4. Not running in automated test environment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isAutomated = navigator.webdriver || window.navigator.userAgent.includes('Headless') || (window as any).__NAHAN_IS_AUTOMATED__;

    if (hasSeenOnboarding || !identity || isLocked || isAutomated) {
      return;
    }

    // Initialize driver
    driverObj.current = driver({
      showProgress: true,
      animate: true,
      allowClose: false, // Force user to click "Done" or "Skip"
      doneBtnText: t('tour.done', 'Got it!'),
      nextBtnText: t('tour.next', 'Next'),
      prevBtnText: t('tour.prev', 'Back'),
      onDestroyed: () => {
        // Mark as seen when tour is finished or skipped
        setHasSeenOnboarding(true);
        logger.info('[Tour] Completed or Skipped');
      },
      popoverClass: 'nahan-driver-popover theme-dark bg-industrial-900 text-industrial-100 border border-industrial-700 shadow-xl rounded-xl',
      steps: [
        {
          element: 'header',
          popover: {
            title: t('tour.welcome.title', 'Welcome to Nahan'),
            description: t('tour.welcome.desc', 'Your secure, offline, "Sealed Letter" messenger. No servers. No cloud. Just you and your recipient.'),
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-testid="nav-keys"]', // We need to ensure these IDs exist in App.tsx navigation
          popover: {
            title: t('tour.keys.title', 'Manage Identities'),
            description: t('tour.keys.desc', 'Create your identity here. Share your "Sealed Identity" card physically to connect with others.'),
            side: 'top',
          },
        },
        {
          element: '[data-testid="nav-chats"]',
          popover: {
            title: t('tour.chats.title', 'Encrypted Chats'),
            description: t('tour.chats.desc', 'Write messages here. They are saved as encrypted files on your device.'),
            side: 'top',
          },
        },
         {
          element: '[data-testid="nav-settings"]',
          popover: {
            title: t('tour.settings.title', 'Settings & Tools'),
            description: t('tour.settings.desc', 'Configure security, biometrics, and backup your data.'),
            side: 'top',
          },
        },
        {
            element: '[data-testid="header-help-icon"]', // This will be the new icon we add
            popover: {
                title: t('tour.help.title', 'Need Help?'),
                description: t('tour.help.desc', 'Click here anytime to review the concept or restart this tour.'),
                side: 'bottom',
                align: 'end'
            }
        }
      ]
    });

    // Start the tour
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
        driverObj.current?.drive();
    }, 1000);

    return () => {
        clearTimeout(timer);
        driverObj.current?.destroy();
    };

  }, [hasSeenOnboarding, identity, isLocked, t, setHasSeenOnboarding]);

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
