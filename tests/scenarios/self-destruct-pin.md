# Self-Destruct PIN E2E Test Scenario

## Overview
Test the self-destruct PIN feature that allows users to configure an emergency PIN that wipes all data when entered on the lock screen.

## Prerequisites
- Fresh application state (no existing account)
- User completes onboarding with master PIN: `123456`

## Test Flow

### 1. Setup Self-Destruct PIN
1. Navigate to Settings tab
2. Scroll to Security section
3. Click on "Emergency Data Wipe" accordion to expand
4. Verify status shows "No emergency PIN configured"
5. Click "Setup Emergency PIN" button
6. Full-screen modal opens with warning message
7. Enter emergency PIN: `654321` (different from master PIN)
8. Confirm emergency PIN: `654321`
9. Verify success toast: "Emergency PIN configured successfully"
10. Modal closes automatically
11. Verify status now shows "Emergency PIN is configured"

### 2. Verify PIN Validation
1. Click "Change Emergency PIN" button
2. Try to enter master PIN `123456` as emergency PIN
3. Verify error: "Emergency PIN must be different from your unlock PIN"
4. Enter different PIN: `111111`
5. Try to confirm with wrong PIN: `222222`
6. Verify error: "PINs do not match"
7. Cancel the modal

### 3. Test Self-Destruct Trigger
1. Lock the application
2. On lock screen, enter the self-destruct PIN: `654321`
3. Verify immediate data wipe (no confirmation dialog)
4. Verify app reloads to onboarding/welcome screen
5. Verify all data is cleared (no identity, no contacts, no messages)

### 4. Verify Data Persistence
1. Complete onboarding again with PIN: `123456`
2. Navigate to Settings → Security → Emergency Data Wipe
3. Setup emergency PIN: `999999`
4. Lock and unlock with master PIN `123456`
5. Verify emergency PIN is still configured
6. Navigate to Settings → Security → Emergency Data Wipe
7. Click "Remove Emergency PIN"
8. Verify success toast: "Emergency PIN removed"
9. Verify status shows "No emergency PIN configured"

## Expected Results
- ✅ Self-destruct PIN can be set up successfully
- ✅ Validation prevents using master PIN as emergency PIN
- ✅ Validation ensures PIN confirmation matches
- ✅ Entering self-destruct PIN on lock screen triggers immediate wipe
- ✅ All data (IndexedDB + localStorage) is cleared
- ✅ App returns to fresh onboarding state
- ✅ Emergency PIN persists across lock/unlock cycles
- ✅ Emergency PIN can be removed successfully

## Data Verification
After self-destruct trigger:
- IndexedDB `nahan` database should be empty
- localStorage should be cleared
- No identity exists
- No contacts exist
- No messages exist
- App shows welcome/onboarding screen
