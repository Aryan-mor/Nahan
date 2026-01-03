import { usePWA } from '../hooks/usePWA';
import { RefreshCw, ShieldAlert, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface VersionInfo {
  version: string;
  changes: string[];
}

export function PWAUpdateNotification() {
  const { needRefresh, updateServiceWorker } = usePWA();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    if (needRefresh) {
      // Fetch latest version info avoiding cache
      fetch(`/version.json?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => setVersionInfo(data))
        .catch(err => console.error('Failed to fetch version info', err));
    }
  }, [needRefresh]);

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
        >
          <div className="bg-industrial-800 border border-green-500/50 rounded-lg shadow-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between bg-industrial-800/90 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="bg-green-500/10 p-2 rounded-full">
                  <ShieldAlert className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-industrial-100">New Security Update</h3>
                  <p className="text-xs text-industrial-400">
                    {versionInfo ? `v${versionInfo.version} Available` : 'Update available'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => updateServiceWorker(true)}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Update
              </button>
            </div>
            
            {versionInfo && versionInfo.changes && (
              <div className="px-4 pb-3 bg-industrial-900/50">
                <div className="flex items-center gap-2 mb-1 pt-2">
                  <Info className="w-3 h-3 text-industrial-400" />
                  <span className="text-xs font-medium text-industrial-300">Improvements:</span>
                </div>
                <ul className="list-disc list-inside text-xs text-industrial-400 space-y-0.5 ml-1">
                  {versionInfo.changes.map((change, idx) => (
                    <li key={idx}>{change}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
