import { motion } from 'framer-motion';
import { Shield, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function WelcomeFeatures() {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="grid grid-cols-1 gap-4 w-full"
    >
      <div className="flex items-center gap-4 bg-industrial-900/50 p-4 rounded-xl border border-industrial-800">
        <div className="p-2 bg-blue-500/10 rounded-lg">
          <Shield className="w-6 h-6 text-blue-400" />
        </div>
        <div className="text-left">
          <h3 className="font-semibold text-industrial-200">
            {t('welcome.features.encrypted.title')}
          </h3>
          <p className="text-xs text-industrial-400">
            {t('welcome.features.encrypted.desc')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-industrial-900/50 p-4 rounded-xl border border-industrial-800">
        <div className="p-2 bg-green-500/10 rounded-lg">
          <Zap className="w-6 h-6 text-green-400" />
        </div>
        <div className="text-left">
          <h3 className="font-semibold text-industrial-200">
            {t('welcome.features.offline.title')}
          </h3>
          <p className="text-xs text-industrial-400">{t('welcome.features.offline.desc')}</p>
        </div>
      </div>
    </motion.div>
  );
}
