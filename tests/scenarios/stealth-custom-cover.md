# Stealth Custom Cover Text Scenario

## Objective
Verify that User A can send a stealth message with custom cover text via long-press, and User B receives it.

## Actors
- **User A**: Sender
- **User B**: Receiver

## Preconditions
- Users A and B are connected (exchanged keys).

## Steps
1. **User A: Type Message**
   - Type "My Secret Message" in chat input.
2. **User A: Long Press Send**
   - Long press (>500ms) on the Send button.
   - Verify `UnifiedStealthDrawer` (Stealth Modal) opens.
3. **User A: Customize Cover Text**
   - Ensure "Hide in Text" tab is active.
   - Enter custom cover text: "This is a boring weather report." in the textarea.
   - Click "Send Stealth Message".
4. **User A: Verify Sent Message**
   - Verify the last message bubble contains the cover text: "This is a boring weather report."
   - Verify the bubble has the stealth indicator (optional/context dependent).
5. **User B: Receive & Decode**
   - User B sees the message.
   - Verify User B can decode it (via manual import if checking cross-device logic, or auto-detect if checking same-device simulation).
   - *Since this is an E2E test with distinct contexts, User A's clipboard isn't automatically User B's clipboard unless we transfer it.*
   - **Action**: User B manually imports the message (simulating receiving the text).
   - **Verification**: The decoded message reveals "My Secret Message".
