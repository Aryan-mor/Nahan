export interface DecryptedMessage {
  data: string;
  verified: boolean;
  signatureValid: boolean;
  senderFingerprint?: string;
}
