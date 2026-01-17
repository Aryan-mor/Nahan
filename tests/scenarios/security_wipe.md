
# Security Wipe Scenario

## Description
Verify that the application wipes all data and resets to a fresh state after 5 consecutive failed PIN entry attempts on the Lock Screen.

## Pre-conditions
- Application is clean.
- User has created an identity (User A) with PIN "111111".

## Steps

1. **Signup User A**
   - Use standard signup flow.
   - PIN: "111111".

2. **Lock Application**
   - Reload page to trigger Lock Screen.

3. **Failed Attempt 1**
   - Enter PIN "000000".
   - Verify Toast: "Incorrect PIN. 4 attempts remaining."
   - Verify: Stay on Lock Screen.

4. **Failed Attempt 2**
   - Enter PIN "000000".
   - Verify Toast: "Incorrect PIN. 3 attempts remaining."

5. **Failed Attempt 3**
   - Enter PIN "000000".
   - Verify Toast: "Incorrect PIN. 2 attempts remaining."

6. **Failed Attempt 4**
   - Enter PIN "000000".
   - Verify Toast: "Incorrect PIN. 1 attempts remaining."

7. **Failed Attempt 5 (Trigger Wipe)**
   - Enter PIN "000000".
   - Verify Toast: "Maximum attempts reached. Wiping data..." (or similar error message).
   - **Action**: App should automatically reload or navigate.

8. **Verify Reset**
   - Verify user lands on **Welcome Screen** (or Language Selection).
   - **Verification**: `AuthPage.performSignup` works for a NEW user (User B).
   - **DB Verification**: Check `nahan` database. `secure_vault` object store should NOT contain the old identity ID.

## Post-conditions
- Application is ready for new user registration.
