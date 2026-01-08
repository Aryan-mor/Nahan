# Scenario: P2P Messaging (Two Users)

## Goal
Verify that two distinct users (User A and User B) can exchange keys and communicate securely.

## Actors
- **User A**: The receiver (Initializes Identity First).
- **User B**: The sender (Adds User A and sends message).

## Preconditions
- Clean State for both contexts (New Profilies).

## Steps
1. **User A Setup**
    - Completes Onboarding.
    - Navigates to Home.
    - Copies Identity (Stealth ID) to clipboard.

2. **User B Setup**
    - Completes Onboarding (in separate window).
    - Navigates to "Add Contact".
    - Pastes User A's Stealth ID.
    - Verifies "Contact Found" (Stealth Decode).
    - Writes initial message "Hello User A".
    - Clicks Send.

3. **Message Delivery**
    - User B checks chat list for sent message.
    - User A checks chat list for received message "Hello User A".

## Verification
- User A must see "Hello User A" in their chat list.
- User B must see "Hello User A" in their chat list (Local Echo).
