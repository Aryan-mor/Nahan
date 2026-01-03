import { Delete, CornerDownLeft } from 'lucide-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  label?: string;
  subLabel?: string;
  error?: string;
  maxLength?: number;
  isLoading?: boolean;
}

export const PinPad: React.FC<PinPadProps> = ({
  value,
  onChange,
  onComplete,
  label,
  subLabel,
  error,
  maxLength = 6,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const displayLabel = label || t('pinpad.enter_pin');

  const handleNumberClick = (num: number) => {
    if (value.length < maxLength && !isLoading) {
      const newValue = value + num;
      onChange(newValue);
    }
  };

  const handleDelete = () => {
    if (value.length > 0 && !isLoading) {
      onChange(value.slice(0, -1));
    }
  };

  const handleEnter = () => {
    if (value.length > 0 && !isLoading && onComplete) {
      onComplete(value);
    }
  };

  // Auto-submit when maxLength is reached
  useEffect(() => {
    if (value.length === maxLength && onComplete && !isLoading) {
      onComplete(value);
    }
  }, [value, maxLength, onComplete, isLoading]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;

      if (/^[0-9]$/.test(e.key)) {
        if (value.length < maxLength) {
          onChange(value + parseInt(e.key));
        }
      } else if (e.key === 'Backspace') {
        if (value.length > 0) {
          onChange(value.slice(0, -1));
        }
      } else if (e.key === 'Enter') {
        if (value.length > 0 && onComplete) {
          onComplete(value);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, isLoading, maxLength, onChange, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto p-6">
      {/* Header / Display */}
      <div className="text-center mb-8 w-full">
        <h2 className="text-2xl font-bold text-industrial-100 mb-2">{displayLabel}</h2>
        {subLabel && <p className="text-industrial-400 text-sm mb-6">{subLabel}</p>}

        {/* Dots Display */}
        <div className="flex justify-center gap-4 mb-4">
          {Array.from({ length: maxLength }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                i < value.length
                  ? error
                    ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                    : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]'
                  : 'bg-industrial-800 border border-industrial-700'
              }`}
            />
          ))}
        </div>

        {/* Error Message */}
        <div className="h-6">
          {error && <p className="text-red-400 text-sm animate-pulse">{error}</p>}
        </div>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-6 w-full max-w-[300px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleNumberClick(num)}
            disabled={isLoading}
            className="w-16 h-16 rounded-full bg-industrial-800 hover:bg-industrial-700 active:bg-industrial-600 text-industrial-100 text-2xl font-semibold transition-all duration-150 flex items-center justify-center border border-industrial-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {num}
          </button>
        ))}

        <button
          onClick={handleDelete}
          disabled={isLoading || value.length === 0}
          className="w-16 h-16 rounded-full bg-transparent hover:bg-industrial-800/50 text-industrial-400 hover:text-industrial-200 transition-all duration-150 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={t('pinpad.backspace')}
        >
          <Delete className="w-8 h-8" />
        </button>

        <button
          onClick={() => handleNumberClick(0)}
          disabled={isLoading}
          className="w-16 h-16 rounded-full bg-industrial-800 hover:bg-industrial-700 active:bg-industrial-600 text-industrial-100 text-2xl font-semibold transition-all duration-150 flex items-center justify-center border border-industrial-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          0
        </button>

        <button
          onClick={handleEnter}
          disabled={isLoading || value.length === 0}
          className="w-16 h-16 rounded-full bg-transparent hover:bg-industrial-800/50 text-industrial-400 hover:text-industrial-200 transition-all duration-150 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={t('pinpad.enter')}
        >
          <CornerDownLeft className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
};
