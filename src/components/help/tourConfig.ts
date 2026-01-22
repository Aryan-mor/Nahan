
import { DriveStep, Driver } from 'driver.js';
import { TFunction } from 'i18next';
import React from 'react';

// Helper to advance on click (Hybrid Navigation)
const setupAdvanceOnClick = (driverObj: React.MutableRefObject<Driver | undefined>, element?: Element) => {
  if (!element) return;

  const clickHandler = () => {
    // Add small delay to allow UI ripple/feedback
    setTimeout(() => {
        if (driverObj.current) {
            if (driverObj.current.isLastStep()) {
                driverObj.current.destroy();
            } else {
                driverObj.current.moveNext();
            }
        }
    }, 300);
    element.removeEventListener('click', clickHandler);
  };

  element.addEventListener('click', clickHandler, { once: true });
};


// Helper to get correct tab selector based on platform
const getTabSelector = (tabId: string, isMobile: boolean) => {
    return isMobile ? `[data-testid="nav-mobile-${tabId}"]` : `[data-testid="nav-${tabId}"]`;
};

// Sub-helpers for each topic
const getIdentitySteps = (t: TFunction, driverObj: React.MutableRefObject<Driver | undefined>, isMobile: boolean): DriveStep[] => [
    {
        element: getTabSelector('keys', isMobile),
        popover: {
            title: t('tour.identity.step1', 'Step 1: Go to Identity'),
            description: t('tour.click_to_proceed', 'Click on the Keys tab to proceed.'),
            side: 'top',
            showButtons: [],
        },
        onHighlightStarted: (el) => setupAdvanceOnClick(driverObj, el),
    },
    {
        element: '[data-testid="identity-card"]',
        popover: {
            title: t('tour.identity.step2', 'Your Sealed Identity'),
            description: t('tour.identity.desc', 'This is your digital card. Click it to copy your ID.'),
            side: 'bottom',
            showButtons: ['next'],
        },
        onHighlightStarted: (el) => setupAdvanceOnClick(driverObj, el),
    }
];

const getContactsSteps = (t: TFunction, driverObj: React.MutableRefObject<Driver | undefined>, isMobile: boolean): DriveStep[] => [
    {
        element: getTabSelector('keys', isMobile),
        popover: {
            title: t('tour.contacts.step1', 'Step 1: Go to Contacts'),
            description: t('tour.contacts.desc1', 'Click on the Keys tab to proceed.'),
            side: 'top',
            showButtons: [],
        },
        onHighlightStarted: (el) => setupAdvanceOnClick(driverObj, el),
    },
    {
        element: '[data-testid="add-contact-scan-btn"]',
        popover: {
            title: t('tour.contacts.step2', 'Scan QR'),
            description: t('tour.contacts.desc', 'Click here to scan a friend\'s QR code.'),
            side: isMobile ? 'top' : 'left',
            showButtons: ['next', 'previous'],
        },
    },
    {
        element: getTabSelector('chats', isMobile),
        popover: {
            title: t('tour.contacts.step3', 'Paste Option'),
            description: t('tour.contacts.paste_desc', 'Now, click the Chats tab to see manual options.'),
            side: 'top',
            showButtons: [],
        },
        onHighlightStarted: (el) => setupAdvanceOnClick(driverObj, el),
    },
    {
        element: '[data-testid="chat-list-manual-paste-icon"]',
        popover: {
            title: t('tour.contacts.step4', 'Manual Paste'),
            description: t('tour.contacts.paste_btn_desc', 'Paste a copied code here to add a contact.'),
            side: 'bottom',
            showButtons: ['next', 'previous'],
        },
    }
];

const getChatHelpSteps = (t: TFunction, isMobile: boolean): DriveStep[] => [
    {
        element: '[data-testid="chat-input-field"]',
        popover: {
            title: t('tour.chat.step1', 'Message Input'),
            description: t('tour.chat.input_desc', 'Type your regular messages here.'),
            side: 'top',
            showButtons: ['next'],
        }
    },
    {
        element: '[data-testid="chat-input-attach"]',
        popover: {
            title: t('tour.chat.step2', 'Send Images'),
            description: t('tour.chat.attach_desc', 'Click here to attach and send images.'),
            side: 'top',
            showButtons: ['next', 'previous'],
        }
    },
    {
        element: '[data-testid="chat-send-btn"]',
        popover: {
            title: t('tour.chat.step3', 'Send & Custom Stealth'),
            description: t('tour.chat.send_desc', 'Click to send.\n\nTip: Long-press this button to send a custom "Sealed Letter" (Stealth Mode).'),
            side: isMobile ? 'top' : 'left',
            showButtons: ['next', 'previous'],
        }
    }
];

const getMessagingSteps = (t: TFunction, driverObj: React.MutableRefObject<Driver | undefined>, isMobile: boolean): DriveStep[] => [
    {
        element: getTabSelector('chats', isMobile),
        popover: {
            title: t('tour.messaging.step1', 'Step 1: Go to Chats'),
            description: t('tour.click_to_proceed', 'Click on the Chats tab to proceed.'),
            side: 'top',
            showButtons: [],
        },
        onHighlightStarted: (el) => setupAdvanceOnClick(driverObj, el),
    },
    {
        element: '[data-testid="add-chat-button"]',
        popover: {
            title: t('tour.messaging.step2', 'Start Writing'),
            description: t('tour.messaging.desc', 'Click this button to draft a new "Sealed Letter".'),
            side: 'bottom',
            showButtons: ['next'],
        },
    }
];

const getWelcomeStep = (t: TFunction): DriveStep => ({
    element: '[data-testid="header-help-icon"]',
    popover: {
        title: t('tour.welcome.title', 'Welcome to Nahan'),
        description: t('tour.welcome.desc', 'Nahan uses a "Sealed Letter" metaphor. Your messages are physically transported, like mail.'),
        side: 'bottom',
        align: 'end',
        showButtons: ['next'],
        nextBtnText: t('tour.btn.start', 'Start Tour'),
    }
});

const getFinishStep = (t: TFunction): DriveStep => ({
    element: '[data-testid="header-help-icon"]',
    popover: {
        title: t('tour.finish', 'All Set!'),
        description: t('tour.help.desc', 'Click the Help icon anytime to replay guides.'),
        side: 'bottom',
        align: 'end',
        showButtons: ['next'],
        doneBtnText: t('tour.finish_btn', 'Finish'),
    }
});

const getOnboardingSteps = (t: TFunction, driverObj: React.MutableRefObject<Driver | undefined>, isMobile: boolean): DriveStep[] => [
    getWelcomeStep(t),
    {
      element: getTabSelector('keys', isMobile),
      popover: {
        title: t('tour.step.keys', 'Create Identity'),
        description: t('tour.click_tabs', 'Click the Keys tab to manage your identity.'),
        side: 'top',
        showButtons: [],
      },
      onHighlightStarted: (el) => setupAdvanceOnClick(driverObj, el),
    },
    {
      element: getTabSelector('chats', isMobile),
      popover: {
        title: t('tour.step.chats', 'Messaging'),
        description: t('tour.click_tabs', 'Now, click the Chats tab.'),
        side: 'top',
        showButtons: [],
      },
      onHighlightStarted: (el) => setupAdvanceOnClick(driverObj, el),
    },
     {
      element: getTabSelector('settings', isMobile),
      popover: {
        title: t('tour.step.settings', 'Settings'),
        description: t('tour.click_tabs', 'Finally, click Settings to see security options.'),
        side: 'top',
        showButtons: [],
      },
      onHighlightStarted: (el) => setupAdvanceOnClick(driverObj, el),
    },
    getFinishStep(t)
];

export const getTourSteps = (
  topic: string,
  t: TFunction,
  driverObj: React.MutableRefObject<Driver | undefined>,
  isMobile: boolean = false
): DriveStep[] => {
    switch (topic) {
        case 'identity': return getIdentitySteps(t, driverObj, isMobile);
        case 'contacts': return getContactsSteps(t, driverObj, isMobile);
        case 'chat_help': return getChatHelpSteps(t, isMobile);
        case 'messaging': return getMessagingSteps(t, driverObj, isMobile);
        default: return getOnboardingSteps(t, driverObj, isMobile);
    }
};
