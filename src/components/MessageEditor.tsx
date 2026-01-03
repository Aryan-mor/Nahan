import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Key,
  Lock,
  Share,
  Unlock,
  Users,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cryptoService } from '../services/crypto';
import { storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';

interface MessageEditorProps {
  mode: 'encrypt' | 'decrypt';
}

export function MessageEditor({ mode }: MessageEditorProps) {
  const { currentIdentity, contacts } = useAppStore();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const [message, setMessage] = useState('');
  const [encryptedMessage, setEncryptedMessage] = useState('');
  const [decryptedMessage, setDecryptedMessage] = useState('');
  const [selectedContact, setSelectedContact] = useState<string>('');
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [signatureVerified, setSignatureVerified] = useState<boolean | null>(null);
  const [senderInfo, setSenderInfo] = useState<{ name: string; fingerprint: string } | null>(null);
  const [clipboardTimer, setClipboardTimer] = useState<NodeJS.Timeout | null>(null);

  const isEncryptMode = mode === 'encrypt';
  const title = isEncryptMode ? 'Encrypt Message' : 'Decrypt Message';
  const icon = isEncryptMode ? Lock : Unlock;
  const Icon = icon;

  const handleEncrypt = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message to encrypt');
      return;
    }

    if (!currentIdentity) {
      toast.error('No identity configured. Please generate a key first.');
      return;
    }

    if (!selectedContact) {
      toast.error('Please select a recipient');
      return;
    }

    setIsProcessing(true);

    try {
      const recipient = contacts.find((c) => c.id === selectedContact);
      if (!recipient) {
        toast.error('Selected recipient not found');
        return;
      }

      // For encryption, we need the current identity's private key passphrase
      onOpen(); // Open passphrase modal
    } catch (error) {
      toast.error('Failed to prepare encryption');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecrypt = async () => {
    if (!encryptedMessage.trim()) {
      toast.error('Please paste an encrypted message');
      return;
    }

    if (!currentIdentity) {
      toast.error('No identity configured. Please generate a key first.');
      return;
    }

    setIsProcessing(true);

    try {
      onOpen(); // Open passphrase modal
    } catch (error) {
      toast.error('Failed to prepare decryption');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const processWithPassphrase = async () => {
    if (!passphrase) {
      toast.error('Please enter your passphrase');
      return;
    }

    setIsProcessing(true);

    try {
      if (isEncryptMode) {
        const recipient = contacts.find((c) => c.id === selectedContact);
        if (!recipient) {
          toast.error('Selected recipient not found');
          return;
        }

        const encrypted = await cryptoService.encryptMessage(
          message,
          recipient.publicKey,
          currentIdentity.privateKey,
          passphrase,
        );

        setEncryptedMessage(encrypted);
        setDecryptedMessage('');
        setSignatureVerified(null);
        setSenderInfo(null);

        // Store the message
        await storageService.storeMessage({
          senderFingerprint: currentIdentity.fingerprint,
          recipientFingerprint: recipient.fingerprint,
          content: {
            plain: message,
            encrypted: encrypted,
          },
          isOutgoing: true,
          read: true,
          status: 'sent',
        });

        toast.success('Message encrypted successfully!');
      } else {
        const result = await cryptoService.decryptMessage(
          encryptedMessage,
          currentIdentity.privateKey,
          passphrase,
        );

        setDecryptedMessage(result.data);
        setSignatureVerified(result.signatureValid);

        // Try to identify sender
        const senderFingerprintMatch = encryptedMessage.match(/fingerprint: ([A-F0-9]+)/i);
        if (senderFingerprintMatch) {
          const senderFingerprint = senderFingerprintMatch[1];
          const sender = contacts.find((c) => c.fingerprint === senderFingerprint);
          if (sender) {
            setSenderInfo({ name: sender.name, fingerprint: sender.fingerprint });
          }
        }

        // Store the message
        await storageService.storeMessage({
          senderFingerprint: senderInfo?.fingerprint || 'unknown',
          recipientFingerprint: currentIdentity.fingerprint,
          content: {
            plain: result.data,
            encrypted: encryptedMessage,
          },
          isOutgoing: false,
          read: true,
          isVerified: result.verified,
          status: 'sent',
        });

        toast.success('Message decrypted successfully!');
      }

      onOpenChange(); // Close modal
      setPassphrase('');

      // Clear clipboard after 60 seconds for security
      if (clipboardTimer) {
        clearTimeout(clipboardTimer);
      }
      const timer = setTimeout(() => {
        if (isEncryptMode && encryptedMessage) {
          navigator.clipboard.writeText('');
          toast.info('Clipboard cleared for security');
        }
      }, 60000);
      setClipboardTimer(timer);
    } catch (error) {
      toast.error(isEncryptMode ? 'Failed to encrypt message' : 'Failed to decrypt message');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const shareMessage = async () => {
    if (!encryptedMessage) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Secure Message',
          text: encryptedMessage,
        });
      } else {
        await copyToClipboard(encryptedMessage, 'Encrypted message');
      }
    } catch {
      toast.error('Failed to share message');
    }
  };

  const downloadMessage = () => {
    if (!encryptedMessage) return;

    const blob = new Blob([encryptedMessage], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'secure-message.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Message downloaded');
  };

  // Cleanup clipboard timer on unmount
  useEffect(() => {
    return () => {
      if (clipboardTimer) {
        clearTimeout(clipboardTimer);
      }
    };
  }, [clipboardTimer]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 md:space-y-6"
    >
      <Card className="bg-industrial-900 border-industrial-800 w-full">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-4">
          <div className="flex items-center space-x-3">
            <Icon className="w-6 h-6 text-industrial-400" />
            <h2 className="text-lg sm:text-xl font-semibold text-industrial-100">{title}</h2>
          </div>
          {currentIdentity && (
            <Chip size="sm" variant="flat" className="bg-industrial-800 text-industrial-300">
              {currentIdentity.name}
            </Chip>
          )}
        </CardHeader>

        <CardBody className="space-y-6 p-4">
          {/* No Identity State */}
          {!currentIdentity ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-16 h-16 bg-yellow-900/10 rounded-full flex items-center justify-center mb-2">
                <Key className="w-8 h-8 text-yellow-500" />
              </div>
              <h3 className="text-xl font-bold text-industrial-100">Identity Required</h3>
              <p className="text-industrial-400 max-w-sm">
                You need a secure identity to {isEncryptMode ? 'encrypt' : 'decrypt'} messages.
                Please generate a key pair first.
              </p>
              {/* Note: In a real scenario, we might redirect or show a button to go to Keys tab,
                  but since we have global navigation, we just inform the user. */}
            </div>
          ) : (
            <>
              {/* Contact Selection (Encrypt Mode Only) */}
              {isEncryptMode && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-industrial-300">Recipient</label>
                  <Select
                    selectedKeys={selectedContact ? [selectedContact] : []}
                    onSelectionChange={(keys) => setSelectedContact(Array.from(keys)[0] as string)}
                    placeholder="Choose a contact"
                    className="w-full max-w-full"
                    classNames={{
                      trigger: 'bg-industrial-950 border-industrial-700 hover:bg-industrial-800',
                      popoverContent: 'bg-industrial-900 border-industrial-800',
                    }}
                    isDisabled={contacts.length === 0}
                  >
                    {contacts.map((contact) => (
                      <SelectItem
                        key={contact.id}
                        textValue={contact.name}
                        className="text-industrial-100 data-[hover=true]:bg-industrial-800"
                      >
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-industrial-400" />
                          <div>
                            <div className="font-medium text-industrial-100">{contact.name}</div>
                            <div className="text-xs text-industrial-400">
                              #{contact.fingerprint.slice(-8)}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </Select>
                  {contacts.length === 0 && (
                    <p className="text-xs text-industrial-400">
                      No contacts available. Add contacts in the Keys tab.
                    </p>
                  )}
                </div>
              )}

              {/* Message Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-industrial-300">
                  {isEncryptMode ? 'Message' : 'Encrypted Content'}
                </label>
                <Textarea
                  value={isEncryptMode ? message : encryptedMessage}
                  onValueChange={isEncryptMode ? setMessage : setEncryptedMessage}
                  placeholder={
                    isEncryptMode
                      ? 'Enter your message here...'
                      : 'Paste the encrypted message here...'
                  }
                  minRows={6}
                  maxRows={12}
                  className="w-full"
                  classNames={{
                    input: 'font-mono text-sm text-industrial-100 bg-industrial-950',
                    inputWrapper:
                      'bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:!border-industrial-500',
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  color={isEncryptMode ? 'primary' : 'success'}
                  variant="solid"
                  startContent={<Icon className="w-4 h-4" />}
                  onPress={isEncryptMode ? handleEncrypt : handleDecrypt}
                  isDisabled={isEncryptMode ? !selectedContact : false}
                  isLoading={isProcessing}
                  className="w-full sm:w-auto font-medium"
                >
                  {isEncryptMode ? 'Encrypt' : 'Decrypt'}
                </Button>

                {isEncryptMode && encryptedMessage && (
                  <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1">
                    <Button
                      variant="flat"
                      startContent={<Copy className="w-4 h-4" />}
                      onPress={() => copyToClipboard(encryptedMessage, 'Encrypted message')}
                      className="flex-1 sm:flex-none"
                    >
                      Copy
                    </Button>
                    <Button
                      variant="flat"
                      startContent={<Share className="w-4 h-4" />}
                      onPress={shareMessage}
                      className="flex-1 sm:flex-none"
                    >
                      Share
                    </Button>
                    <Button
                      variant="flat"
                      startContent={<Download className="w-4 h-4" />}
                      onPress={downloadMessage}
                      className="flex-1 sm:flex-none"
                    >
                      Download
                    </Button>
                  </div>
                )}

                {!isEncryptMode && decryptedMessage && (
                  <Button
                    variant="flat"
                    startContent={<Copy className="w-4 h-4" />}
                    onPress={() => copyToClipboard(decryptedMessage, 'Decrypted message')}
                    className="w-full sm:w-auto"
                  >
                    Copy Text
                  </Button>
                )}
              </div>

              {/* Results */}
              {encryptedMessage && isEncryptMode && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <Divider className="bg-industrial-800" />
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-industrial-100 text-sm">Output</h3>
                      <Chip size="sm" color="success" variant="flat" className="h-6 text-xs">
                        Secure Block
                      </Chip>
                    </div>
                    <div className="secure-message-block text-xs sm:text-sm p-3 bg-industrial-950 border-industrial-800">
                      {encryptedMessage}
                    </div>
                  </div>
                </motion.div>
              )}

              {decryptedMessage && !isEncryptMode && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <Divider className="bg-industrial-800" />

                  {/* Signature Verification */}
                  {signatureVerified !== null && (
                    <div
                      className={`p-3 rounded-lg border ${
                        signatureVerified
                          ? 'bg-green-900/20 border-green-700/50 text-green-400'
                          : 'bg-red-900/20 border-red-700/50 text-red-400'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {signatureVerified ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span className="font-medium text-sm">
                          {signatureVerified ? 'Verified Signature' : 'Invalid Signature'}
                        </span>
                      </div>
                      {senderInfo && (
                        <p className="text-xs mt-1 opacity-80 pl-6">
                          From: {senderInfo.name} ({senderInfo.fingerprint.slice(-8)})
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-industrial-100 text-sm">Decrypted Message</h3>
                      <Chip size="sm" color="success" variant="flat" className="h-6 text-xs">
                        Success
                      </Chip>
                    </div>
                    <div className="bg-industrial-950 border border-industrial-800 rounded-lg p-4 font-mono text-sm text-industrial-100 whitespace-pre-wrap">
                      {decryptedMessage}
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* Passphrase Modal */}
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="md"
        placement="center"
        classNames={{
          base: 'bg-industrial-900 border border-industrial-800 m-4',
          header: 'border-b border-industrial-800',
          footer: 'border-t border-industrial-800',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                <div className="flex items-center space-x-2">
                  <Lock className="w-5 h-5 text-industrial-400" />
                  <span className="text-industrial-100">Enter Passphrase</span>
                </div>
              </ModalHeader>
              <ModalBody className="py-6">
                <div className="space-y-4">
                  <p className="text-sm text-industrial-400">
                    Enter your private key passphrase to {mode} this message.
                  </p>
                  <Input
                    label="Passphrase"
                    placeholder="Enter your passphrase"
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    startContent={<Lock className="w-4 h-4 text-industrial-400" />}
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="focus:outline-none"
                      >
                        {showPassphrase ? (
                          <EyeOff className="w-4 h-4 text-industrial-400" />
                        ) : (
                          <Eye className="w-4 h-4 text-industrial-400" />
                        )}
                      </button>
                    }
                    classNames={{
                      input: 'text-industrial-100',
                      inputWrapper:
                        'bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:!border-industrial-500',
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        processWithPassphrase();
                      }
                    }}
                  />
                  <div className="text-xs text-industrial-400 bg-industrial-950 p-3 rounded-lg border border-industrial-800">
                    <p className="font-medium mb-1 text-industrial-300">Security Notice:</p>
                    <p>
                      Your passphrase is used to decrypt your private key temporarily. It is never
                      stored or transmitted.
                    </p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={processWithPassphrase} isLoading={isProcessing}>
                  {isEncryptMode ? 'Encrypt' : 'Decrypt'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
