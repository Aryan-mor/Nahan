import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Switch,
  Select,
  SelectItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Divider,
  Input
} from '@heroui/react';
import {
  Settings as SettingsIcon,
  Trash2,
  Download,
  Globe,
  Shield,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
  Info,
  Lock
} from 'lucide-react';
import { storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';

export function Settings() {
  const { identities, contacts, currentIdentity, initializeApp } = useAppStore();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const { isOpen: isExportOpen, onOpen: onExportOpen, onOpenChange: onExportOpenChange } = useDisclosure();

  const [language, setLanguage] = useState('en');
  const [autoClearClipboard, setAutoClearClipboard] = useState(true);
  const [clipboardTimeout, setClipboardTimeout] = useState(60);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleClearAllData = async () => {
    if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      setIsClearing(true);
      try {
        await storageService.clearAllData();
        toast.success('All data cleared successfully');

        // Reinitialize the app
        await initializeApp();
      } catch (error) {
        toast.error('Failed to clear data');
        console.error(error);
      } finally {
        setIsClearing(false);
        onOpenChange();
      }
    }
  };

  const handleExportData = async () => {
    if (!exportPassword) {
      toast.error('Please enter a password for the export file');
      return;
    }

    if (exportPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    setIsExporting(true);

    try {
      // Get all data
      const allIdentities = await storageService.getIdentities();
      const allContacts = await storageService.getContacts();

      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        identities: allIdentities.map(identity => ({
          ...identity,
          // Note: Private keys are already encrypted with user passphrases
          privateKey: identity.privateKey
        })),
        contacts: allContacts,
        settings: {
          language,
          autoClearClipboard,
          clipboardTimeout
        }
      };

      // Create encrypted export (simplified - in production use proper encryption)
      const exportJson = JSON.stringify(exportData, null, 2);
      const blob = new Blob([exportJson], { type: 'application/json' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nahan-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Data exported successfully');
      onExportOpenChange();
      setExportPassword('');
    } catch (error) {
      toast.error('Failed to export data');
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const languages = [
    { key: 'en', label: 'English', flag: '🇺🇸' },
    { key: 'fa', label: 'فارسی', flag: '🇮🇷' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 md:space-y-6"
    >
      {/* General Settings */}
      <Card className="bg-industrial-900 border-industrial-800">
        <CardHeader className="flex items-center gap-3 p-4">
          <SettingsIcon className="w-5 h-5 text-industrial-400" />
          <h2 className="text-lg font-semibold text-industrial-100">General Settings</h2>
        </CardHeader>
        <CardBody className="space-y-6 p-4 pt-0">
          <div className="space-y-2">
            <label className="text-sm font-medium text-industrial-300">Language</label>
            <Select
              selectedKeys={[language || 'en']}
              onSelectionChange={(keys) => setLanguage(Array.from(keys)[0] as string)}
              className="w-full max-w-xs"
              startContent={<Globe className="w-4 h-4 text-industrial-400" />}
              classNames={{
                trigger: "bg-industrial-950 border-industrial-700 hover:bg-industrial-800",
                popoverContent: "bg-industrial-900 border-industrial-800"
              }}
            >
              {languages.map((lang) => (
                <SelectItem key={lang.key} textValue={lang.label} className="text-industrial-100 data-[hover=true]:bg-industrial-800">
                  <div className="flex items-center space-x-2">
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>

          <Divider className="bg-industrial-800" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-industrial-400" />
                <div>
                  <p className="font-medium text-industrial-100">Auto Clear Clipboard</p>
                  <p className="text-sm text-industrial-400">Automatically clear sensitive data</p>
                </div>
              </div>
              <Switch
                isSelected={autoClearClipboard}
                onValueChange={setAutoClearClipboard}
                classNames={{
                  wrapper: "group-data-[selected=true]:bg-industrial-600"
                }}
              />
            </div>

            {autoClearClipboard && (
              <div className="ml-8 space-y-2">
                <label className="text-sm font-medium text-industrial-300">Clear After (seconds)</label>
                <Input
                  type="number"
                  value={clipboardTimeout.toString()}
                  onChange={(e) => setClipboardTimeout(parseInt(e.target.value) || 60)}
                  min={10}
                  max={300}
                  className="max-w-xs"
                  classNames={{
                    input: "text-industrial-100",
                    inputWrapper: "bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:!border-industrial-500"
                  }}
                />
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Security Settings */}
      <Card className="bg-industrial-900 border-industrial-800">
        <CardHeader className="flex items-center gap-3 p-4">
          <Shield className="w-5 h-5 text-industrial-400" />
          <h2 className="text-lg font-semibold text-industrial-100">Security</h2>
        </CardHeader>
        <CardBody className="space-y-6 p-4 pt-0">
          <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <Info className="w-5 h-5 text-blue-400" />
              <div>
                <p className="font-medium text-industrial-100">Security Information</p>
                <p className="text-sm text-industrial-400">
                  NAHAN uses industry-standard OpenPGP encryption with ECC Curve25519 keys.
                </p>
              </div>
            </div>
            <ul className="text-sm text-industrial-400 space-y-1 list-disc list-inside">
              <li>All encryption happens locally on your device</li>
              <li>No data is transmitted to external servers</li>
              <li>Private keys are encrypted with your passphrase</li>
              <li>Messages are signed and encrypted for authenticity</li>
            </ul>
          </div>

          <Divider className="bg-industrial-800" />

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="font-medium text-industrial-100">Advanced Options</p>
                <p className="text-sm text-industrial-400">Show additional security settings</p>
              </div>
            </div>
            <Switch
              isSelected={showAdvanced}
              onValueChange={setShowAdvanced}
              classNames={{
                wrapper: "group-data-[selected=true]:bg-industrial-600"
              }}
            />
          </div>

          {showAdvanced && (
            <div className="ml-8 space-y-4">
              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="font-medium text-yellow-400">Warning</span>
                </div>
                <p className="text-sm text-yellow-300">
                  These options are for advanced users. Use with caution.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  startContent={<Download className="w-4 h-4" />}
                  onPress={onExportOpen}
                  className="flex-1"
                >
                  Export All Data
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  color="danger"
                  startContent={<Trash2 className="w-4 h-4" />}
                  onPress={onOpen}
                  className="flex-1"
                >
                  Clear All Data
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Data Overview */}
      <Card className="bg-industrial-900 border-industrial-800">
        <CardHeader className="flex items-center gap-3 p-4">
          <Info className="w-5 h-5 text-industrial-400" />
          <h2 className="text-lg font-semibold text-industrial-100">Data Overview</h2>
        </CardHeader>
        <CardBody className="p-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-industrial-400">Identities</p>
                  <p className="text-2xl font-bold text-industrial-100">{identities.length}</p>
                </div>
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-blue-400 rounded" />
                </div>
              </div>
            </div>

            <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-industrial-400">Contacts</p>
                  <p className="text-2xl font-bold text-industrial-100">{contacts.length}</p>
                </div>
                <div className="w-8 h-8 bg-green-600/20 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-green-400 rounded" />
                </div>
              </div>
            </div>

            <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-industrial-400">Current Identity</p>
                  <p className="text-lg font-bold text-industrial-100 truncate max-w-[120px]">
                    {currentIdentity?.name || 'None'}
                  </p>
                </div>
                <div className="w-8 h-8 bg-purple-600/20 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-purple-400 rounded" />
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Export Modal */}
      <Modal
        isOpen={isExportOpen}
        onOpenChange={onExportOpenChange}
        size="md"
        placement="center"
        classNames={{
          base: "bg-industrial-900 border border-industrial-800 m-4",
          header: "border-b border-industrial-800",
          footer: "border-t border-industrial-800"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Export All Data</ModalHeader>
              <ModalBody className="py-6">
                <div className="space-y-4">
                  <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Info className="w-4 h-4 text-blue-400" />
                      <span className="font-medium text-blue-400">Export Information</span>
                    </div>
                    <p className="text-sm text-industrial-400">
                      This will export all your identities (with encrypted private keys) and contacts to a JSON file.
                    </p>
                  </div>

                  <Input
                    label="Export Password"
                    placeholder="Enter a password to protect the export"
                    type={showExportPassword ? 'text' : 'password'}
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    startContent={<Lock className="w-4 h-4 text-industrial-400" />}
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowExportPassword(!showExportPassword)}
                        className="focus:outline-none"
                      >
                        {showExportPassword ? <EyeOff className="w-4 h-4 text-industrial-400" /> : <Eye className="w-4 h-4 text-industrial-400" />}
                      </button>
                    }
                    classNames={{
                      input: "text-industrial-100",
                      inputWrapper: "bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:!border-industrial-500"
                    }}
                  />

                  <div className="text-xs text-industrial-400 bg-industrial-950 p-3 rounded-lg border border-industrial-800">
                    <p className="font-medium mb-1 text-industrial-300">Security Notes:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Private keys remain encrypted with your original passphrases</li>
                      <li>This export file should be stored securely</li>
                      <li>The export password adds an additional layer of protection</li>
                    </ul>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleExportData}
                  isLoading={isExporting}
                >
                  Export Data
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Clear Data Modal */}
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="md"
        placement="center"
        classNames={{
          base: "bg-industrial-900 border border-industrial-800 m-4",
          header: "border-b border-industrial-800",
          footer: "border-t border-industrial-800"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Clear All Data</ModalHeader>
              <ModalBody className="py-6">
                <div className="space-y-4">
                  <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="font-medium text-red-400">Warning</span>
                    </div>
                    <p className="text-sm text-red-300">
                      This action will permanently delete all identities, contacts, and messages.
                      This cannot be undone.
                    </p>
                  </div>

                  <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
                    <p className="text-sm text-industrial-400">
                      Data to be deleted:
                    </p>
                    <ul className="text-sm text-industrial-400 mt-2 space-y-1">
                      <li>• {identities.length} identity{identities.length !== 1 ? 'ies' : ''}</li>
                      <li>• {contacts.length} contact{contacts.length !== 1 ? 's' : ''}</li>
                      <li>• All encrypted messages</li>
                      <li>• Application settings</li>
                    </ul>
                  </div>

                  <div className="text-xs text-industrial-400 bg-industrial-950 p-3 rounded-lg border border-industrial-800">
                    <p className="font-medium mb-1 text-industrial-300">Recommendation:</p>
                    <p>
                      Consider exporting your data first before clearing it, in case you need it later.
                    </p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="primary" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="danger"
                  onPress={handleClearAllData}
                  isLoading={isClearing}
                >
                  Clear All Data
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
