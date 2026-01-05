/* eslint-disable max-lines-per-function */
import { Skeleton } from '@heroui/react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSteganographyStore } from '../../stores/steganographyStore';

export function TemporarySteganographyMessage() {
  const { t } = useTranslation();
  const { encodingStatus, originalPreviewUrl, encodedCarrierUrl, setPreviewOpen } =
    useSteganographyStore();

  const isSuccess = encodingStatus === 'success';
  const imageUrl = isSuccess ? encodedCarrierUrl : originalPreviewUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="flex w-full justify-end"
    >
      <div className="flex flex-col max-w-[80%] items-end">
        <div
          className={`relative px-2 py-2 rounded-2xl bg-primary-600 text-white rounded-br-none shadow-md overflow-hidden`}
        >
          {/* Image Area */}
          <div
            className="relative aspect-square w-48 sm:w-64 rounded-xl overflow-hidden bg-black/20 cursor-pointer"
            onClick={() => setPreviewOpen(true)}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Steganography"
                className={`w-full h-full object-cover transition-opacity duration-500 ${
                  encodingStatus === 'processing' ? 'opacity-50' : 'opacity-100'
                }`}
              />
            ) : (
              <Skeleton className="w-full h-full rounded-xl" />
            )}

            {/* Loading Overlay */}
            {encodingStatus === 'processing' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                <Skeleton className="w-full h-full rounded-xl bg-transparent before:animate-[shimmer_2s_infinite]" />
                <div className="absolute font-mono text-xs font-bold tracking-wider uppercase text-white drop-shadow-md animate-pulse">
                  {t('steganography.encoding', 'ENCODING...')}
                </div>
              </div>
            )}
            
            {/* Success Overlay / Icon */}
            {isSuccess && (
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md rounded-full px-2 py-0.5 text-[10px] font-mono border border-white/20">
                    STEGO
                </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-1 px-1">
          <span className="text-[10px] text-industrial-500">
            {new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className="text-[10px] text-industrial-500">•</span>
          <span className="text-[10px] text-industrial-500">
             {isSuccess ? t('common.ready', 'Ready') : t('common.processing', 'Processing')}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
