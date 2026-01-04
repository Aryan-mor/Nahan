import { motion } from 'framer-motion';
import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  CardBody,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { Camera, Copy, Eye, EyeOff, Key, QrCode, Share, Upload, User } from 'lucide-react';
import QRCode from 'qrcode';
import { cryptoService } from '../services/crypto';
import { generateStealthID } from '../services/stealthId';
import { storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';

import { DetectionResult } from '../hooks/useClipboardDetection';
import { dataURItoBlob } from '../lib/utils';
import { MyQRModal } from './MyQRModal';

export function KeyExchange({
  onDetection,
  onNewMessage,
}: {
  onDetection?: (result: DetectionResult) => void;
  onNewMessage?: (result: {
    type: 'message' | 'contact';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  }) => void;
}) {
  const {
    identity,
    contacts,
    addContact,
    addIdentity,
    setSessionPassphrase,
    sessionPassphrase,
    handleUniversalInput,
  } = useAppStore();

  const { camouflageLanguage } = useUIStore();

  // Modals
  const {
    isOpen: isScanOpen,
    onOpen: onScanOpen,
    onOpenChange: onScanOpenChange,
  } = useDisclosure();
  const {
    isOpen: isManualOpen,
    onOpen: onManualOpen,
    onOpenChange: onManualOpenChange,
  } = useDisclosure();
  const {
    isOpen: isGenerateOpen,
    onOpen: onGenerateOpen,
    onOpenChange: onGenerateOpenChange,
  } = useDisclosure();
  const { isOpen: isQROpen, onOpen: onQROpen, onOpenChange: onQROpenChange } = useDisclosure();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // QR & Scanning State
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  // Forms State
  const [entryStep, setEntryStep] = useState<'key' | 'details'>('key');
  const [capturedKey, setCapturedKey] = useState('');

  const [contactForm, setContactForm] = useState({
    name: '',
    publicKey: '',
  });

  const [generateForm, setGenerateForm] = useState({
    name: '',
    passphrase: '',
  });

  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // --- Identity Logic ---

  const generateQRCode = useCallback(async () => {
    if (!identity) return;

    try {
      // We still include email in QR data for backward compatibility with other PGP tools,
      // but we don't display it in our UI.
      const qrData = {
        name: identity.name,
        email: identity.email,
        publicKey: identity.publicKey,
        fingerprint: identity.fingerprint,
        type: 'nahan-public-key',
      };

      const dataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 300,
        margin: 2,
        color: {
          dark: '#e2e8f0', // industrial-200
          light: '#020617', // industrial-950
        },
      });

      setQrCodeDataUrl(dataUrl);
    } catch {
      toast.error('Failed to generate QR code');
    }
  }, [identity]);

  useEffect(() => {
    if (identity) {
      generateQRCode();
    }
  }, [identity, generateQRCode]);

  const handleGenerateKey = async () => {
    if (!generateForm.name.trim()) {
      toast.error('Please fill in your name');
      return;
    }

    if (!generateForm.passphrase) {
      toast.error('Please create a passphrase');
      return;
    }

    const validation = cryptoService.validatePassphrase(generateForm.passphrase);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    setIsGenerating(true);

    try {
      // Auto-generate email internally (required for PGP) but don't show to user
      const sanitizedName = generateForm.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `${sanitizedName || 'user'}@nahan.local`;

      const keyPair = await cryptoService.generateKeyPair(
        generateForm.name,
        email,
        generateForm.passphrase,
      );

      if (!sessionPassphrase) {
        toast.error('SecureStorage: Missing key');
        return;
      }

      const identity = await storageService.storeIdentity(
        {
          name: generateForm.name,
          email: email,
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
          fingerprint: keyPair.fingerprint,
        },
        sessionPassphrase,
      );

      addIdentity(identity);

      // Set session passphrase so user can start chatting immediately
      setSessionPassphrase(generateForm.passphrase);

      toast.success('Identity generated successfully!');
      onGenerateOpenChange();
      setGenerateForm({ name: '', passphrase: '' });
    } catch {
      toast.error('Failed to generate identity');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyIdentityKey = async () => {
    if (!identity) return;
    try {
      const name = identity.name || 'Unknown';
      // Generate stealth ID (steganographic poetry) instead of plaintext
      const stealthID = generateStealthID(name, identity.publicKey, camouflageLanguage || 'fa');
      await navigator.clipboard.writeText(stealthID);
      toast.success('Secure Stealth ID copied as poetry!');
    } catch (error) {
      console.error('Failed to generate stealth ID:', error);
      toast.error('Failed to copy stealth ID');
    }
  };

  const copyQRData = async () => {
    if (!qrCodeDataUrl) return;
    try {
      const blob = dataURItoBlob(qrCodeDataUrl);
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      toast.success('QR Code copied to clipboard');
    } catch (err) {
      console.error(err);
      toast.error('Failed to copy QR Code');
    }
  };

  const shareQRCode = async () => {
    if (!qrCodeDataUrl || !identity) return;
    try {
      const blob = dataURItoBlob(qrCodeDataUrl);
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `nahan-${identity.name}-qr.png`, {
          type: 'image/png',
        });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `NAHAN Identity - ${identity.name}`,
            text: identity.publicKey,
            files: [file],
          });
        }
      } else {
        copyQRData();
      }
    } catch {
      toast.error('Failed to share');
    }
  };

  // --- Scanning Logic ---

  const stopScanning = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const startScanning = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Camera not supported');
      return;
    }

    onScanOpen();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      mediaStreamRef.current = stream;

      // Attach to video element if available
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }

      // Start scanning loop
      requestAnimationFrame(scanFrame);
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Failed to access camera');
    }
  };

  const scanFrame = () => {
    if (!mediaStreamRef.current || !mediaStreamRef.current.active) return;
    if (!videoRef.current) {
      requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          handleScannedData(code.data);
          return;
        }
      }
    }
    requestAnimationFrame(scanFrame);
  };

  const handleScannedData = async (data: string) => {
    stopScanning();
    onScanOpenChange(); // Close scan modal

    try {
      // Try parsing as JSON (Nahan QR format)
      let publicKey = '';
      let name = '';

      try {
        const parsedData = JSON.parse(data);
        if (parsedData.type === 'nahan-public-key') {
          publicKey = parsedData.publicKey || '';
          name = parsedData.name || '';
        }
      } catch {
        // Not JSON, check if it's a raw key OR USERNAME+KEY
        const { username: parsedName, key: parsedKey, isValid } = cryptoService.parseKeyInput(data);
        if (isValid) {
          publicKey = parsedKey;
          // Prefer extracted name from prefix if available
          name = parsedName || '';

          // If no name from prefix, try to get from key
          if (!name) {
            name = (await cryptoService.getNameFromKey()) || '';
          }
        }
      }

      if (publicKey && cryptoService.isValidKeyFormat(publicKey)) {
        setCapturedKey(publicKey);
        setContactForm({
          name: name,
          publicKey: '', // Clear input as we have captured it
        });
        setEntryStep('details');
        toast.success('QR code scanned!');
        onManualOpen();
      } else {
        toast.error('Invalid QR code format');
      }
    } catch {
      toast.error('Failed to process scanned data');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          handleScannedData(code.data);
        } else {
          toast.error('No QR code found in image');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  // --- Contact Logic ---

  const handlePublicKeyChange = async (value: string) => {
    setContactForm((prev) => ({ ...prev, publicKey: value }));

    // Check for valid PGP key format (or with prefix)
    const { username: parsedName, key: parsedKey, isValid } = cryptoService.parseKeyInput(value);

    if (isValid) {
      try {
        let name = parsedName;

        // If no name from prefix, try to get from key
        if (!name) {
          name = await cryptoService.getNameFromKey();
        }

        // Transition to details step
        setCapturedKey(parsedKey);
        setContactForm((prev) => ({
          ...prev,
          name: name || '',
          publicKey: '', // Clear input field as requested
        }));
        setEntryStep('details');

        if (name) {
          toast.success(`Found identity: ${name}`);
        } else {
          toast.success('Valid key detected');
        }
      } catch {
        // Invalid key, stay on input step
      }
    }
  };

  const handleImportDecode = async () => {
    if (!contactForm.publicKey.trim()) {
      toast.error('Please enter content to decode');
      return;
    }

    setIsImporting(true);
    try {
      const result = await handleUniversalInput(contactForm.publicKey.trim(), undefined, true);

      // If a message was detected, show the new message modal
      if (result && result.type === 'message') {
        if (onNewMessage) {
          onNewMessage(result);
        }
        // Clear the textarea after successful import
        setContactForm({ ...contactForm, publicKey: '' });
        // Note: Modal will be closed by the parent component when DetectionModal/NewMessageModal is shown
      }
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
      };
      if (err.message === 'CONTACT_INTRO_DETECTED') {
        // UNIFICATION: Handle contact ID detection the same way as auto-detector
        if (onDetection && err.keyData) {
          const contactName = err.keyData.name || err.keyData.username || 'Unknown';
          const contactPublicKey = err.keyData.publicKey || err.keyData.key;
          if (contactPublicKey) {
            onDetection({
              type: 'id',
              contactName: contactName,
              contactPublicKey: contactPublicKey,
            });
            // Clear the textarea after successful import
            setContactForm({ ...contactForm, publicKey: '' });
            // Note: Modal will be closed by the parent component when DetectionModal is shown
          } else {
            toast.error('Invalid contact key format');
          }
        } else {
          toast.error('Contact key detected but handler not available');
        }
      } else if (err.message === 'SENDER_UNKNOWN') {
        toast.error('Unknown sender. Please add the contact first.');
      } else {
        toast.error('Failed to decode content. Please check the format.');
        console.error('[KeyExchange] Import decode error:', error);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddContact = async () => {
    // Determine the key to use based on the current step
    const keyToUse = entryStep === 'details' ? capturedKey : contactForm.publicKey;

    // 1. Basic Field Validation
    if (!contactForm.name.trim()) {
      toast.error('Please enter a contact name');
      return;
    }

    if (!keyToUse.trim()) {
      toast.error('Public key is missing');
      return;
    }

    try {
      // 2. Validate the key format and get fingerprint
      const fingerprint = await cryptoService.getFingerprint(keyToUse);

      // 3. Self-Contact Validation
      if (identity && fingerprint === identity.fingerprint) {
        toast.error('You cannot add yourself as a contact');
        return;
      }

      // 4. Duplicate Contact Validation
      const existingContact = contacts.find((c) => c.fingerprint === fingerprint);
      if (existingContact) {
        toast.error(`Contact already exists as "${existingContact.name}"`);
        return;
      }

      // 5. Remove name from key content before storage (as requested)
      const cleanPublicKey = await cryptoService.removeNameFromKey(keyToUse);

      // 6. Store the contact
      if (!sessionPassphrase) {
        toast.error('SecureStorage: Missing key');
        return;
      }

      const contact = await storageService.storeContact(
        {
          name: contactForm.name.trim(),
          publicKey: cleanPublicKey,
          fingerprint,
        },
        sessionPassphrase,
      );

      addContact(contact);
      toast.success('Contact added successfully');
      onManualOpenChange();

      // Reset State
      setContactForm({ name: '', publicKey: '' });
      setCapturedKey('');
      setEntryStep('key');
    } catch (error) {
      console.error('Add contact error:', error);
      toast.error('Invalid public key format');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 md:space-y-6"
    >
      <Card className="bg-industrial-900 border-industrial-800 min-h-[500px] mb-16">
        <CardBody className="p-4 sm:p-6">
          {!identity ? (
            <div className="text-center py-12">
              <Key className="w-16 h-16 text-industrial-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-industrial-100 mb-2">No Identity Found</h3>
              <p className="text-industrial-400 mb-6 max-w-sm mx-auto">
                Create a secure identity to start exchanging messages.
              </p>
              <Button color="primary" size="lg" onPress={onGenerateOpen}>
                Create Identity
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* My Identity Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-industrial-100">My Identity</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <Button
                    size="lg"
                    variant="flat"
                    onPress={copyIdentityKey}
                    className="bg-industrial-800 text-industrial-100 h-24 flex flex-col gap-2 p-2 min-w-0"
                  >
                    <Copy className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium text-center whitespace-normal leading-tight">
                      Copy ID
                    </span>
                  </Button>
                  <Button
                    size="lg"
                    variant="flat"
                    onPress={shareQRCode}
                    className="bg-industrial-800 text-industrial-100 h-24 flex flex-col gap-2 p-2 min-w-0"
                  >
                    <Share className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium text-center whitespace-normal leading-tight">
                      Share ID
                    </span>
                  </Button>
                  <Button
                    size="lg"
                    variant="flat"
                    onPress={onQROpen}
                    className="bg-industrial-800 text-industrial-100 h-24 flex flex-col gap-2 p-2 min-w-0"
                  >
                    <QrCode className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium text-center whitespace-normal leading-tight">
                      View QR
                    </span>
                  </Button>
                </div>
              </div>

              <Divider className="my-6 bg-industrial-800" />

              {/* Add Contact Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-industrial-100">Add Contact</h3>

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileUpload}
                />

                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <Button
                    size="lg"
                    color="primary"
                    variant="flat"
                    onPress={startScanning}
                    className="h-24 flex flex-col gap-2 p-2 min-w-0"
                  >
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium text-center whitespace-normal leading-tight">
                      Scan QR
                    </span>
                  </Button>
                  <Button
                    size="lg"
                    color="secondary"
                    variant="flat"
                    onPress={() => fileInputRef.current?.click()}
                    className="h-24 flex flex-col gap-2 p-2 min-w-0"
                  >
                    <Upload className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium text-center whitespace-normal leading-tight">
                      Upload QR
                    </span>
                  </Button>
                  <Button
                    size="lg"
                    color="default"
                    variant="flat"
                    onPress={onManualOpen}
                    className="h-24 flex flex-col gap-2 p-2 min-w-0"
                  >
                    <User className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium text-center whitespace-normal leading-tight">
                      Manual
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* View QR Code Modal */}
      <MyQRModal isOpen={isQROpen} onOpenChange={onQROpenChange} />

      {/* Generate Identity Modal */}
      <Modal
        isOpen={isGenerateOpen}
        onOpenChange={onGenerateOpenChange}
        classNames={{
          base: 'bg-industrial-900 border border-industrial-800',
          header: 'border-b border-industrial-800',
          footer: 'border-t border-industrial-800',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Create New Identity</ModalHeader>
              <ModalBody className="gap-4 py-6">
                <Input
                  label="Display Name"
                  placeholder="How others will see you"
                  value={generateForm.name}
                  onValueChange={(v) => setGenerateForm({ ...generateForm, name: v })}
                  variant="bordered"
                  classNames={{
                    inputWrapper: 'bg-industrial-950 border-industrial-700',
                  }}
                />
                <Input
                  label="Passphrase"
                  placeholder="Protect your private key"
                  type={showPassphrase ? 'text' : 'password'}
                  value={generateForm.passphrase}
                  onValueChange={(v) => setGenerateForm({ ...generateForm, passphrase: v })}
                  variant="bordered"
                  endContent={
                    <button onClick={() => setShowPassphrase(!showPassphrase)}>
                      {showPassphrase ? (
                        <EyeOff className="w-4 h-4 text-industrial-400" />
                      ) : (
                        <Eye className="w-4 h-4 text-industrial-400" />
                      )}
                    </button>
                  }
                  classNames={{
                    inputWrapper: 'bg-industrial-950 border-industrial-700',
                  }}
                />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleGenerateKey} isLoading={isGenerating}>
                  Create
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Manual Contact Modal */}
      <Modal
        isOpen={isManualOpen}
        onOpenChange={(open) => {
          onManualOpenChange();
          if (!open) {
            // Reset state on close
            setEntryStep('key');
            setCapturedKey('');
            setContactForm({ name: '', publicKey: '' });
          }
        }}
        size="lg"
        classNames={{
          base: 'bg-industrial-900 border border-industrial-800',
          header: 'border-b border-industrial-800',
          footer: 'border-t border-industrial-800',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Add Contact</ModalHeader>
              <ModalBody className="gap-4 py-6">
                {entryStep === 'key' ? (
                  <div className="space-y-4">
                    <Textarea
                      autoFocus
                      label="Public Key"
                      placeholder="Paste public key block here (-----BEGIN PGP...)"
                      value={contactForm.publicKey}
                      onChange={(e) => handlePublicKeyChange(e.target.value)}
                      variant="bordered"
                      minRows={8}
                      classNames={{
                        inputWrapper: 'bg-industrial-950 border-industrial-700 font-mono text-xs',
                      }}
                    />
                    <p className="text-xs text-industrial-400">
                      Paste the full PGP Public Key block, Stealth ID (Poetry), or encrypted
                      message. The name will be automatically extracted.
                    </p>
                    <Button
                      color="primary"
                      variant="bordered"
                      onPress={handleImportDecode}
                      isLoading={isImporting}
                      isDisabled={!contactForm.publicKey.trim() || isImporting}
                      className="w-full"
                    >
                      Import & Decode
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Textarea
                      label="Public Key"
                      value={capturedKey}
                      isReadOnly
                      variant="bordered"
                      minRows={6}
                      classNames={{
                        inputWrapper:
                          'bg-industrial-950 border-industrial-700 font-mono text-xs opacity-70',
                      }}
                    />

                    <Input
                      autoFocus
                      label="Name"
                      placeholder="Contact name"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      variant="bordered"
                      classNames={{
                        inputWrapper: 'bg-industrial-950 border-industrial-700',
                      }}
                    />

                    <Button
                      size="sm"
                      variant="light"
                      color="primary"
                      onPress={() => {
                        setEntryStep('key');
                        setContactForm((prev) => ({ ...prev, publicKey: capturedKey }));
                      }}
                      className="w-full"
                    >
                      Change Key
                    </Button>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                {entryStep === 'details' && (
                  <Button color="primary" onPress={handleAddContact}>
                    Add Contact
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Scan Modal (Placeholder for Camera) */}
      <Modal
        isOpen={isScanOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            stopScanning();
          }
          onScanOpenChange();
        }}
        classNames={{
          base: 'bg-industrial-900 border border-industrial-800',
        }}
        size="lg"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Scan QR Code</ModalHeader>
              <ModalBody
                className="py-0 px-0 items-center justify-center bg-black overflow-hidden relative"
                style={{ minHeight: '400px' }}
              >
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover absolute inset-0 z-0"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                  playsInline
                />
                <div className="z-10 w-64 h-64 border-2 border-primary/50 border-dashed rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] pointer-events-none relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="w-8 h-8 text-primary/50 animate-pulse" />
                  </div>
                </div>
                <p className="absolute bottom-8 z-20 text-white font-medium bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">
                  Point camera at a NAHAN QR code
                </p>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
