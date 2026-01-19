# Scenario: Contact Sharing (Multi-Select)

## Context
A user wants to share one or multiple contacts from their contact list with another user. This feature allows bulk sharing of contact identities.

## Flows

### 1. Multi-Contact Share (Manual Copy)
1. **Navigate**: User is on the Chat List tab.
2. **Action**: User long-presses (or right-clicks) a chat to enter Selection Mode.
3. **Action**: User selects multiple contacts.
4. **Action**: User clicks the "Menu" trigger (ID: `selection-menu-trigger`).
5. **Action**: User clicks "Share Contacts" (ID: `contact-option-bulk-share`).
6. **Action**: User confirms "Share Contacts" prompt (optionally choosing to include their own identity).
7. **Display**: Share Modal opens showing the number of contacts selected.
8. **Action**: User clicks "Copy Identity" (ID: `copy-identity-modal`).
9. **Verification**: System copies the encrypted package to clipboard.

### 2. Multi-Contact Share (QR Code)
1. **Navigate**: User is on the Chat List tab.
2. **Action**: User enters Selection Mode and selects contacts.
3. **Action**: User clicks "Share Contacts" from the menu.
4. **Action**: User confirms prompt.
5. **Display**: Share Modal opens with QR code visible (ID: `qr-code-img`).
6. **Action**: User (Receiver) scans this QR code or uploads the image.

### 3. Receiver Import (Manual)
1. **Navigate**: Receiver navigates to "Keys" or "Contacts" tab.
2. **Action**: Receiver clicks Manual Import button (ID: `manual-entry-button`).
3. **Action**: Receiver pastes the content into the text area (ID: `manual-import-textarea`).
4. **Action**: Receiver clicks "Decode" (ID: `manual-import-decode-btn`).
5. **Display**: Detection Modal appears showing "Found X contacts" (ID: `detection-modal`).
6. **Action**: Receiver clicks "Add All" (ID: `detection-add-multi-btn`).
7. **Verification**: Contacts are added to the Receiver's contact list and visible in Chats/Contacts.

### 4. Receiver Import (QR Scan/Upload)
1. **Navigate**: Receiver navigates to "Contacts" tab.
2. **Action**: Receiver clicks "Upload QR" (ID: `add-contact-upload-btn`) or uses the scanner.
3. **Display**: Detection Modal appears showing "Found X contacts" (ID: `detection-modal`).
4. **Action**: Receiver clicks "Add All" (ID: `detection-add-multi-btn`).
5. **Verification**: Contacts are added to the Receiver's contact list.
