# Scenario: Broadcast Messaging (One-to-Many Emulation)

## Goal
Verify that User A can send a broadcast message and User B receives it correctly as a message from User A.

## Actors
- **User A**: The Sender (Sends "Hello Everyone" via Broadcast Channel).
- **User B**: The Receiver (Manually imports the message).

## Preconditions
- User A and User B are connected (exchanged identities).
- Both are on the Chat List screen.

## Steps
1. **User A: Send Broadcast**
    - Navigates to "Broadcast" channel.
    - Writes "Hello Everyone".
    - Clicks Send.
    - System auto-copies the encrypted/signed message.

2. **User B: Receive Broadcast**
    - Opens "Import from Text" modal.
    - Pastes the clipboard content (simulated transfer).
    - Clicks "Import & Decode".
    - Verifies success.

3. **Message Verification**
    - User B navigates to **User A's** chat (NOT a Broadcast chat).
    - Verifies the last message is "Hello Everyone".
    - (Optional) Verify it is marked as a broadcast/signed message if UI supports it.
