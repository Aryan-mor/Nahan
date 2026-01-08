# Scenario: Identity Sharing & Verification

## Context
A user wants to share their identity/public key with another user or device.

## Flows

### 1. Home Page Copy
1. **Navigate**: User is on the Main Dashboard (Chats Tab).
2. **Action**: User clicks the "Copy Identity" button in the header (ID: `copy-identity-home`).
3. **Verification**: System copies the public key/identity string to clipboard. Toast confirms success.

### 2. QR Modal (via Header)
1. **Navigate**: User is on the Main Dashboard.
2. **Action**: User clicks the "Show QR Code" button in the header (ID: `view-qr-header`).
3. **Display**: QR Modal opens. QR Code is visible.
4. **Action**: User clicks "Copy Identity" button inside modal (ID: `copy-identity-modal`).
5. **Verification**: System copies identity to clipboard.

### 3. Keys Page Copy
1. **Navigate**: User navigates to "Keys" or "Identity" tab.
2. **Action**: User clicks "Copy Identity" button (ID: `copy-identity-keys`).
3. **Verification**: System copies identity to clipboard.

### 4. QR Modal (via Keys Page)
1. **Navigate**: User is on "Keys" tab.
2. **Action**: User clicks "View QR" button (ID: `view-qr-keys`).
3. **Display**: QR Modal opens.
4. **Action**: (Optional) User verifies visual QR code presence.
