import { Card, CardBody, Divider } from '@heroui/react';
import { motion } from 'framer-motion';

import { DetectionResult } from '../hooks/useClipboardDetection';
import { useAppStore } from '../stores/appStore';

import { AddContact } from './key-exchange/AddContact';
import { IdentityOnboarding } from './key-exchange/IdentityOnboarding';
import { MyIdentity } from './key-exchange/MyIdentity';

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
  const { identity } = useAppStore();

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
            <IdentityOnboarding />
          ) : (
            <div className="space-y-6">
              <MyIdentity />

              <Divider className="my-6 bg-industrial-800" />

              <AddContact onDetection={onDetection} onNewMessage={onNewMessage} />
            </div>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}
