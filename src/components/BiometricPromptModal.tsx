/* eslint-disable max-lines-per-function */
import { Fingerprint, X } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface BiometricPromptModalProps {
  onClose: () => void;
  onEnable: () => void;
  onDecline: () => void;
}

export const BiometricPromptModal: React.FC<BiometricPromptModalProps> = ({
  onClose,
  onEnable,
  onDecline,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="biometric-title"
      >
        <div className="p-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
            <Fingerprint size={32} className="text-blue-500" />
          </div>

          <h2 id="biometric-title" className="text-xl font-semibold text-white mb-2">
            {t('biometric.prompt.title', 'Enable Biometric Unlock?')}
          </h2>

          <p className="text-neutral-400 mb-6 text-sm leading-relaxed">
            {t('biometric.prompt.description', 'Use your fingerprint or face ID to unlock Nahan securely and quickly next time.')}
          </p>

          <div className="flex gap-3 w-full">
            <button
              onClick={onDecline}
              className="flex-1 px-4 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-medium hover:bg-neutral-700 active:scale-[0.98] transition-all"
            >
              {t('common.maybeLater', 'Maybe Later')}
            </button>
            <button
              onClick={onEnable}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/20"
            >
              {t('common.enable', 'Enable')}
            </button>
          </div>
        </div>

        <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-neutral-500 hover:text-white transition-colors"
            aria-label={t('common.close', 'Close')}
        >
            <X size={20} />
        </button>
      </div>
    </div>
  );
};
