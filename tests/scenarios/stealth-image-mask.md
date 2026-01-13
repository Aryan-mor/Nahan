# Stealth Image Mask Scenario

## User Stories
- As a user, I want to hide my secret message inside a generated image so that it looks like a harmless visual.
- As a recipient, I want to be able to decode this image using the manual import tool if I received it via other channels.

## Test Scenario: Send & Manual Decode of Stealth Image

### 1. User A: Creation & Sending
- Navigate to User B's chat.
- Type a secret message: "My Hidden Image Secret".
- **Long Press** the send button to open the Stealth Drawer.
- Switch to the **"Hide in Image"** tab.
- Click **"Generate Mask"**.
- Wait for the image to be generated (displayed).
- Click **"Send Now"**.
- Verify the image appears in the chat bubble (as an image, not text).
- **Simulate Transport**: Capture the generated image data (e.g., base64 source) from the preview or clipboard.

### 2. User B: Reception & Decoding
- Open the **"Import from Text"** modal (Manual Paste) from a neutral location (e.g., Chat List).
- **Paste** the image data (Base64 URL) into the input area.
- Click **"Decode"**.
- Verify the **Detection Modal** appears.
- Navigate to the chat view.
- Verify the decoded message matches "My Hidden Image Secret".
