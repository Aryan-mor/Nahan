/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
  useDisclosure,
} from '@heroui/react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  Heart,
  Info,
  Lock,
  Settings as SettingsIcon,
  Share2,
  Shield,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useClipboardPermission } from '../hooks/useClipboardDetection';
import { storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';
import { downloadPortableFile, sharePortableFile } from '../utils/portable';
import { BiometricPromptModal } from './BiometricPromptModal';
import { ClipboardPermissionPrompt } from './ClipboardPermissionPrompt';

export function Settings() {
  const {
    identity,
    contacts,
    wipeData,
    clearAllMessages,
    isBiometricsSupported,
    isBiometricsEnabled,
    enableBiometrics,
    disableBiometrics,
  } = useAppStore();

  const {
    isStandalone,
    setInstallPromptVisible,
    language,
    setLanguage,
    camouflageLanguage,
    setCamouflageLanguage,
  } = useUIStore();
  const { t } = useTranslation();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const {
    isOpen: isExportOpen,
    onOpen: onExportOpen,
    onOpenChange: onExportOpenChange,
  } = useDisclosure();
  const {
    isOpen: isLogoutOpen,
    onOpen: onLogoutOpen,
    onOpenChange: onLogoutOpenChange,
  } = useDisclosure();

  const {
    isOpen: isClipboardModalOpen,
    onOpen: onClipboardModalOpen,
    onOpenChange: onClipboardModalOpenChange,
  } = useDisclosure();

  const clipboardPermission = useClipboardPermission();

  const [autoClearClipboard, setAutoClearClipboard] = useState(true);
  const [clipboardTimeout, setClipboardTimeout] = useState(60);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOfflineSharingInfo, setShowOfflineSharingInfo] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    onLogoutOpen();
  };

  const handleLogoutConfirm = async () => {
    logger.info(`Logout & Wipe action initiated by user`);
    setIsLoggingOut(true);
    try {
      await wipeData();
      toast.success(t('lock.logged_out', 'Logged out successfully'));
    } catch (error) {
      logger.error('Logout failed:', error);
      toast.error(t('settings.logout.error', 'Logout failed'));
      setIsLoggingOut(false);
    }
  };

  const handleClearAllData = async () => {
    logger.info(`Clear Message Data action initiated by user`);
    setIsClearing(true);
    try {
      await clearAllMessages();
      toast.success(t('settings.clear.success'));
    } catch (error) {
      toast.error(t('settings.clear.error'));
      logger.error(error);
    } finally {
      setIsClearing(false);
      onOpenChange();
    }
  };

  const handleExportData = async () => {
    if (!exportPassword) {
      toast.error(t('settings.export.password_error'));
      return;
    }

    if (exportPassword.length < 8) {
      toast.error(t('settings.export.password_length_error'));
      return;
    }

    setIsExporting(true);

    try {
      // Get all data
      const { sessionPassphrase: passphrase } = useAppStore.getState();
      if (!passphrase) {
        toast.error(t('settings.errors.missing_key'));
        return;
      }

      const allContacts = await storageService.getContacts(passphrase);

      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        identity: identity
          ? {
              ...identity,
              // Note: Private keys are already encrypted with user passphrases
              privateKey: identity.privateKey,
            }
          : null,
        contacts: allContacts,
        settings: {
          language,
          autoClearClipboard,
          clipboardTimeout,
        },
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

      toast.success(t('settings.export.success'));
      onExportOpenChange();
      setExportPassword('');
    } catch (error) {
      toast.error(t('settings.export.error'));
      logger.error(error);
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
      {/* Offline Sharing Section - First priority in Settings */}
      <Card
        className="bg-gradient-to-r from-purple-900/20 to-industrial-900 border-purple-500/30"
        data-testid="offline-sharing-section"
      >
        <CardBody className="p-4">
          <div className="flex flex-col gap-3">
            {/* Header with toggle */}
            <button
              onClick={() => setShowOfflineSharingInfo(!showOfflineSharingInfo)}
              className="w-full flex items-center justify-between"
              aria-expanded={showOfflineSharingInfo}
              data-testid="offline-sharing-accordion-toggle"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Share2 className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-start">
                  <p className="font-medium text-industrial-100">
                    {t(
                      'settings.offline_sharing.title',
                      'Share application file for offline/restricted access',
                    )}
                  </p>
                  <p className="text-xs text-industrial-400">
                    {t(
                      'settings.offline_sharing.subtitle',
                      'Send this app to others without internet',
                    )}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-industrial-400 transition-transform duration-300 ${
                  showOfflineSharingInfo ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Expandable content */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                showOfflineSharingInfo ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="pt-3 border-t border-industrial-800">
                <p className="text-sm text-industrial-300 leading-relaxed mb-3">
                  {t(
                    'settings.offline_sharing.description',
                    'You can share this single application file directly with others via local messengers. Once they open it, they can use the app to exchange encrypted messages with you without needing global internet access. This ensures your communication remains private and accessible during network restrictions.',
                  )}
                </p>
                <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <Heart className="w-4 h-4 text-pink-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-industrial-300">
                      {t(
                        'settings.offline_sharing.support_message',
                        'We believe in free and open communication for everyone. 💜',
                      )}
                    </p>
                  </div>
                </div>

                {/* Download & Share Actions */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    size="sm"
                    color="secondary"
                    variant="flat"
                    startContent={<Download className="w-4 h-4" />}
                    className="flex-1"
                    data-testid="offline-sharing-download-button"
                    onPress={() => {
                      downloadPortableFile();
                      toast.success(
                        t('settings.offline_sharing.download_success', 'Portable file downloaded!'),
                      );
                    }}
                  >
                    {t('settings.offline_sharing.download_button', 'Download App File')}
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={<Share2 className="w-4 h-4" />}
                    className="flex-1"
                    data-testid="offline-sharing-share-button"
                    onPress={async () => {
                      if (!navigator.share) {
                        toast.error(
                          t(
                            'settings.offline_sharing.share_not_supported',
                            'Sharing not supported on this device',
                          ),
                        );
                        return;
                      }
                      try {
                        const shared = await sharePortableFile();
                        if (shared) {
                          toast.success(
                            t('settings.offline_sharing.share_success', 'Shared successfully!'),
                          );
                        }
                      } catch (err) {
                        if ((err as Error).name !== 'AbortError') {
                          toast.error(t('settings.offline_sharing.share_error', 'Failed to share'));
                        }
                      }
                    }}
                  >
                    {t('settings.offline_sharing.share_button', 'Share App File')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Install App Card */}
      {!isStandalone && (
        <Card className="bg-gradient-to-r from-blue-900/20 to-industrial-900 border-blue-500/30">
          <CardBody className="flex flex-row items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Download className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-industrial-100">{t('settings.install.title')}</p>
                <p className="text-xs text-industrial-400">{t('settings.install.subtitle')}</p>
              </div>
            </div>
            <Button
              size="sm"
              color="primary"
              onPress={() => setInstallPromptVisible(true)}
              className="bg-blue-600"
            >
              {t('settings.install.button')}
            </Button>
          </CardBody>
        </Card>
      )}

      {/* General Settings */}
      <Card className="bg-industrial-900 border-industrial-800">
        <CardHeader className="flex items-center gap-3 p-4">
          <SettingsIcon className="w-5 h-5 text-industrial-400" />
          <h2 className="text-lg font-semibold text-industrial-100">
            {t('settings.general.title')}
          </h2>
        </CardHeader>
        <CardBody className="space-y-6 p-4 pt-0">
          <div className="space-y-2">
            <label className="text-sm font-medium text-industrial-300">
              {t('settings.general.language')}
            </label>
            <Select
              aria-label={t('settings.general.language')}
              selectedKeys={[language || 'en']}
              onSelectionChange={(keys) => setLanguage(Array.from(keys)[0] as string)}
              className="w-full max-w-xs"
              startContent={<Globe className="w-4 h-4 text-industrial-400" />}
              classNames={{
                trigger: 'bg-industrial-950 border-industrial-700 hover:bg-industrial-800',
                popoverContent: 'bg-industrial-900 border-industrial-800',
              }}
            >
              {languages.map((lang) => (
                <SelectItem
                  key={lang.key}
                  textValue={lang.label}
                  className="text-industrial-100 data-[hover=true]:bg-industrial-800"
                >
                  <div className="flex items-center space-x-2">
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-industrial-300">
              {t('settings.general.camouflage')}
            </label>
            <Select
              aria-label={t('settings.general.camouflage')}
              selectedKeys={[camouflageLanguage || 'fa']}
              onSelectionChange={(keys) =>
                setCamouflageLanguage(Array.from(keys)[0] as 'fa' | 'en')
              }
              className="w-full max-w-xs"
              startContent={<Shield className="w-4 h-4 text-industrial-400" />}
              classNames={{
                trigger: 'bg-industrial-950 border-industrial-700 hover:bg-industrial-800',
                popoverContent: 'bg-industrial-900 border-industrial-800',
              }}
            >
              <SelectItem
                key="fa"
                textValue={t('settings.languages.fa')}
                className="text-industrial-100 data-[hover=true]:bg-industrial-800"
              >
                <div className="flex items-center space-x-2">
                  <span>🇮🇷</span>
                  <span>{t('settings.languages.fa')}</span>
                </div>
              </SelectItem>
              <SelectItem
                key="en"
                textValue={t('settings.languages.en')}
                className="text-industrial-100 data-[hover=true]:bg-industrial-800"
              >
                <div className="flex items-center space-x-2">
                  <span>🇺🇸</span>
                  <span>{t('settings.languages.en')}</span>
                </div>
              </SelectItem>
            </Select>
          </div>

          <Divider className="bg-industrial-800" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-industrial-400" />
                <div>
                  <p className="font-medium text-industrial-100">
                    {t('settings.general.clipboard.title')}
                  </p>
                  <p className="text-sm text-industrial-400">
                    {t('settings.general.clipboard.subtitle')}
                  </p>
                </div>
              </div>
              <Switch
                isSelected={autoClearClipboard}
                onValueChange={setAutoClearClipboard}
                classNames={{
                  wrapper: 'group-data-[selected=true]:bg-industrial-600',
                }}
              />
            </div>

            <div className="ml-8 space-y-4">
              {autoClearClipboard && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-industrial-300">
                    {t('settings.general.clipboard.timeout')}
                  </label>
                  <Input
                    type="number"
                    value={clipboardTimeout.toString()}
                    onChange={(e) => setClipboardTimeout(parseInt(e.target.value) || 60)}
                    min={10}
                    max={300}
                    className="max-w-xs"
                    classNames={{
                      input: 'text-industrial-100',
                      inputWrapper:
                        'bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:!border-industrial-500',
                    }}
                  />
                </div>
              )}

              {clipboardPermission.state !== 'granted' && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-industrial-950 border border-industrial-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-industrial-100">
                        {t('settings.general.clipboard.permission_title', 'Clipboard Access')}
                      </p>
                      <p className="text-xs text-industrial-400">
                        {t(
                          'settings.general.clipboard.permission_needed',
                          'Permission required for auto-detection',
                        )}
                      </p>
                    </div>
                  </div>

                  <Button size="sm" variant="flat" color="primary" onPress={onClipboardModalOpen}>
                    {t('settings.general.clipboard.grant_button', 'Allow Access')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Security Settings */}
      <Card className="bg-industrial-900 border-industrial-800">
        <CardHeader className="flex items-center gap-3 p-4">
          <Shield className="w-5 h-5 text-industrial-400" />
          <h2 className="text-lg font-semibold text-industrial-100">
            {t('settings.security.title')}
          </h2>
        </CardHeader>
        <CardBody className="space-y-6 p-4 pt-0">
          <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <Info className="w-5 h-5 text-blue-400" />
              <div>
                <p className="font-medium text-industrial-100">
                  {t('settings.security.info.title')}
                </p>
                <p className="text-sm text-industrial-400">{t('settings.security.info.desc')}</p>
              </div>
            </div>
            <ul className="text-sm text-industrial-400 space-y-1 list-disc list-inside">
              <li>{t('settings.security.info.points.1')}</li>
              <li>{t('settings.security.info.points.2')}</li>
              <li>{t('settings.security.info.points.3')}</li>
              <li>{t('settings.security.info.points.4')}</li>
            </ul>
          </div>

          {isBiometricsSupported && (
            <>
              <Divider className="bg-industrial-800" />
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Fingerprint className="w-5 h-5 text-industrial-400" />
                  <div>
                    <p className="font-medium text-industrial-100">
                      {t('settings.security.biometrics.title', 'Biometric Unlock')}
                    </p>
                    <p className="text-sm text-industrial-400">
                      {t(
                        'settings.security.biometrics.subtitle',
                        'Use fingerprint or face ID to unlock',
                      )}
                    </p>
                  </div>
                </div>
                <Switch
                  isSelected={isBiometricsEnabled}
                  onValueChange={async (val) => {
                    if (val) {
                      setShowBiometricModal(true);
                    } else {
                      const success = await disableBiometrics();
                      if (success)
                        toast.success(t('biometric.disabled', 'Biometric unlock disabled'));
                    }
                  }}
                  classNames={{
                    wrapper: 'group-data-[selected=true]:bg-blue-600',
                  }}
                />
              </div>

              {/* Biometric Confirmation Modal inside Settings */}
              {showBiometricModal && (
                <BiometricPromptModal
                  onClose={() => setShowBiometricModal(false)}
                  onDecline={() => setShowBiometricModal(false)}
                  onEnable={async () => {
                    const success = await enableBiometrics();
                    if (success) {
                      toast.success(t('biometric.enabled', 'Biometric unlock enabled'));
                      setShowBiometricModal(false);
                    } else {
                      toast.error(t('biometric.enable_failed', 'Failed to enable biometrics'));
                      setShowBiometricModal(false);
                    }
                  }}
                />
              )}
            </>
          )}

          <Divider className="bg-industrial-800" />

          <Divider className="bg-industrial-800" />

          {/* Advanced Options Accordion */}
          <div className="border border-industrial-800 rounded-lg overflow-hidden transition-all duration-300">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-4 bg-industrial-900 hover:bg-industrial-800 transition-colors"
              aria-expanded={showAdvanced}
            >
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <div className="text-left">
                  <p className="font-medium text-industrial-100">
                    {t('settings.security.advanced.title')}
                  </p>
                  <p className="text-sm text-industrial-400">
                    {t('settings.security.advanced.subtitle')}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-industrial-400 transition-transform duration-300 ${
                  showAdvanced ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Collapsible Content */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                showAdvanced ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="p-4 bg-industrial-900.5 space-y-4 border-t border-industrial-800">
                {/* Warning Banner */}
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="font-medium text-yellow-400">
                      {t('settings.security.advanced.warning')}
                    </span>
                  </div>
                  <p className="text-sm text-yellow-300">
                    {t(
                      'settings.security.advanced.warning_text',
                      'These actions are destructive or for debugging only.',
                    )}
                  </p>
                </div>

                {/* Debug Mode Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-3">
                    <Activity className="w-5 h-5 text-industrial-400" />
                    <div>
                      <p className="font-medium text-industrial-100">
                        {t('settings.debug.hud.title', 'Enable Performance HUD')}
                      </p>
                      <p className="text-sm text-industrial-400">
                        {t(
                          'settings.debug.hud.subtitle',
                          'Show debug metrics overlay (Requires Reload)',
                        )}
                      </p>
                    </div>
                  </div>
                  <Switch
                    isSelected={localStorage.getItem('nahan_force_perf_hud') === 'true'}
                    onValueChange={(val) => {
                      if (val) {
                        localStorage.setItem('nahan_force_perf_hud', 'true');
                      } else {
                        localStorage.removeItem('nahan_force_perf_hud');
                      }
                      // Force reload to apply clean state
                      window.location.reload();
                    }}
                    classNames={{
                      wrapper: 'group-data-[selected=true]:bg-blue-600',
                    }}
                    data-testid="perf-hud-toggle"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    size="sm"
                    variant="flat"
                    color="warning"
                    startContent={<Download className="w-4 h-4" />}
                    onPress={onExportOpen}
                    className="flex-1"
                  >
                    {t('settings.security.advanced.export')}
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    color="danger"
                    startContent={<Lock className="w-4 h-4" />}
                    onPress={handleLogout}
                    className="flex-1"
                  >
                    {t('settings.security.advanced.logout', 'Logout')}
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    color="danger"
                    startContent={<Trash2 className="w-4 h-4" />}
                    onPress={onOpen}
                    className="flex-1"
                  >
                    {t('settings.security.advanced.clear')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Data Overview */}
      <Card className="bg-industrial-900 border-industrial-800">
        <CardHeader className="flex items-center gap-3 p-4">
          <Info className="w-5 h-5 text-industrial-400" />
          <h2 className="text-lg font-semibold text-industrial-100">{t('settings.data.title')}</h2>
        </CardHeader>
        <CardBody className="p-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-industrial-400">{t('settings.data.identities')}</p>
                  <p className="text-2xl font-bold text-industrial-100">{identity ? 1 : 0}</p>
                </div>
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-blue-400 rounded" />
                </div>
              </div>
            </div>

            <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-industrial-400">{t('settings.data.contacts')}</p>
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
                  <p className="text-sm text-industrial-400">
                    {t('settings.data.current_identity')}
                  </p>
                  <p className="text-lg font-bold text-industrial-100 truncate max-w-[120px]">
                    {identity?.name || t('settings.data.none')}
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

      {/* Danger Zone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          size="lg"
          color="danger"
          variant="flat"
          startContent={<Lock className="w-5 h-5" />}
          onPress={handleLogout}
          className="w-full"
        >
          {t('settings.logout.title', 'Logout')}
        </Button>
        <Button
          size="lg"
          color="danger"
          startContent={<Trash2 className="w-5 h-5" />}
          onPress={onOpen}
          className="w-full"
        >
          {t('settings.clear.title')}
        </Button>
      </div>

      {/* Logout Modal */}
      <Modal
        isOpen={isLogoutOpen}
        onOpenChange={onLogoutOpenChange}
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
              <ModalHeader>{t('settings.logout.title', 'Logout')}</ModalHeader>
              <ModalBody className="py-6">
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="font-medium text-yellow-400">
                      {t('settings.security.advanced.warning')}
                    </span>
                  </div>
                  <p className="text-sm text-yellow-300">
                    {t('settings.logout.warning', 'You will be logged out.')}
                  </p>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="primary" variant="light" onPress={onClose}>
                  {t('settings.logout.cancel', 'Cancel')}
                </Button>
                <Button color="danger" onPress={handleLogoutConfirm} isLoading={isLoggingOut}>
                  {t('settings.logout.confirm', 'Logout')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Export Modal */}
      <Modal
        isOpen={isExportOpen}
        onOpenChange={onExportOpenChange}
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
              <ModalHeader>{t('settings.export.title')}</ModalHeader>
              <ModalBody className="py-6">
                <div className="space-y-4">
                  <div className="bg-industrial-800 border border-industrial-700 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Info className="w-4 h-4 text-blue-400" />
                      <span className="font-medium text-blue-400">
                        {t('settings.export.info_title')}
                      </span>
                    </div>
                    <p className="text-sm text-industrial-400">{t('settings.export.info_desc')}</p>
                  </div>

                  <Input
                    label={t('settings.export.password_label')}
                    placeholder={t('settings.export.password_placeholder')}
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
                        {showExportPassword ? (
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
                  />

                  <div className="text-xs text-industrial-400 bg-industrial-950 p-3 rounded-lg border border-industrial-800">
                    <p className="font-medium mb-1 text-industrial-300">
                      {t('settings.export.notes_title')}
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('settings.export.notes.1')}</li>
                      <li>{t('settings.export.notes.2')}</li>
                      <li>{t('settings.export.notes.3')}</li>
                    </ul>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  {t('settings.export.cancel')}
                </Button>
                <Button color="primary" onPress={handleExportData} isLoading={isExporting}>
                  {t('settings.export.confirm')}
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
          base: 'bg-industrial-900 border border-industrial-800 m-4',
          header: 'border-b border-industrial-800',
          footer: 'border-t border-industrial-800',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('settings.clear_messages.title')}</ModalHeader>
              <ModalBody className="py-6">
                <div className="space-y-4">
                  <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="font-medium text-red-400">
                        {t('settings.security.advanced.warning')}
                      </span>
                    </div>
                    <p className="text-sm text-red-300">{t('settings.clear_messages.warning')}</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="primary" variant="light" onPress={onClose}>
                  {t('settings.clear_messages.cancel')}
                </Button>
                <Button color="danger" onPress={handleClearAllData} isLoading={isClearing}>
                  {t('settings.clear_messages.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Clipboard Permission Modal */}
      <ClipboardPermissionPrompt
        isOpen={isClipboardModalOpen}
        onClose={() => onClipboardModalOpenChange()}
        onPermissionGranted={() => {
          // Force re-check or just toast
          toast.success(t('clipboard.permission.granted', 'Clipboard permission granted'));
          onClipboardModalOpenChange();
        }}
      />
    </motion.div>
  );
}
