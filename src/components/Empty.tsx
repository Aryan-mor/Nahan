import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

// Empty component
export default function Empty() {
  const { t } = useTranslation()
  return (
    <div className={cn('flex h-full items-center justify-center')}>{t('empty.message')}</div>
  )
}
