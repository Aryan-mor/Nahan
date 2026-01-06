import { Accordion, AccordionItem } from '@heroui/react';
import { AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AdvancedOptions() {
  const { t } = useTranslation();

  return (
    <div className="w-full space-y-4 mt-4">
      {/* Global Warning */}
      <div className="bg-warning-900/20 border border-warning-900/50 rounded-lg p-3 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
        <p className="text-sm text-warning-200">
          {t(
            'stealth.warning.file_transfer',
            'Important: Always send this image as a File/Document in messaging apps. Standard photo sharing will destroy the hidden data.',
          )}
        </p>
      </div>

      {/* Custom Carrier Security Warning */}
      <div className="space-y-2">
        <p className="text-xs text-industrial-400 flex items-center gap-2">
          <Info className="w-4 h-4" />
          {t(
            'stealth.warning.public_image',
            'Caution: Public images may reveal the existence of hidden data.',
          )}
        </p>

        <Accordion>
          <AccordionItem
            key="1"
            aria-label="Learn more"
            title={
              <span className="text-xs text-industrial-500">
                {t('common.learn_more', 'Learn More')}
              </span>
            }
            classNames={{ title: 'text-xs' }}
          >
            <p className="text-xs text-industrial-400">
              {t(
                'stealth.warning.learn_more_content',
                'Using public images found online may allow observers to detect changes through bit-comparison. However, even if detected, your content remains cryptographically secure and unreadable without your private key.',
              )}
            </p>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
