import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import pwaLogo from '../../assets/pwa-192x192.png?inline';

export function WelcomeHeader() {
  const { t } = useTranslation();

  return (
    <>
      {/* Logo / Branding */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="w-24 h-24 bg-industrial-800 rounded-2xl p-4 shadow-2xl border border-industrial-700"
      >
        <img
          src={pwaLogo}
          alt={t('welcome.logo_alt')}
          className="w-full h-full object-contain"
        />
      </motion.div>

      {/* Welcome Text */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="space-y-3"
      >
        <h1 className="text-3xl font-bold text-industrial-100">{t('welcome.title')}</h1>
        <p className="text-industrial-400 text-lg">{t('welcome.subtitle')}</p>
      </motion.div>
    </>
  );
}
