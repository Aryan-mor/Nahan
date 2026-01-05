import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface SteganographyState {
  // Mode
  viewMode: 'encode' | 'decode';

  // Encoding State (Sender)
  encodingStatus: 'idle' | 'processing' | 'success' | 'error';
  encodedCarrierUrl: string | null; // The result image (Carrier)
  originalPreviewUrl: string | null; // The input image
  encodingError: string | null;
  pendingMessageId: string | null; // ID of the temporary message in Chat UI
  isPreviewOpen: boolean;

  // Decoding State (Receiver)
  decodingStatus: 'idle' | 'processing' | 'success' | 'error';
  decodingCarrierUrl: string | null; // The image being decoded
  decodedImageUrl: string | null; // The result image (Hidden content)
  senderPublicKey: string | null; // The sender's public key (needed for decryption)
  decodingError: string | null;

  // Actions
  setViewMode: (mode: 'encode' | 'decode') => void;
  setEncodingStatus: (status: 'idle' | 'processing' | 'success' | 'error') => void;
  setEncodedCarrierUrl: (url: string | null) => void;
  setOriginalPreviewUrl: (url: string | null) => void;
  setEncodingError: (error: string | null) => void;
  setPendingMessageId: (id: string | null) => void;
  setPreviewOpen: (open: boolean) => void;
  resetEncoding: () => void;

  setDecodingStatus: (status: 'idle' | 'processing' | 'success' | 'error') => void;
  setDecodingCarrierUrl: (url: string | null) => void;
  setDecodedImageUrl: (url: string | null) => void;
  setSenderPublicKey: (key: string | null) => void;
  setDecodingError: (error: string | null) => void;
  resetDecoding: () => void;
}

export const useSteganographyStore = create<SteganographyState>()(
  devtools(
    // eslint-disable-next-line max-lines-per-function
    (set) => ({
      // Mode
      viewMode: 'encode',

      // Encoding
      encodingStatus: 'idle',
      encodedCarrierUrl: null,
      originalPreviewUrl: null,
      encodingError: null,
      pendingMessageId: null,
      isPreviewOpen: false,

      setViewMode: (mode) => set({ viewMode: mode }),
      setEncodingStatus: (status) => set({ encodingStatus: status }),
      setEncodedCarrierUrl: (url) => set({ encodedCarrierUrl: url }),
      setOriginalPreviewUrl: (url) => set({ originalPreviewUrl: url }),
      setEncodingError: (error) => set({ encodingError: error }),
      setPendingMessageId: (id) => set({ pendingMessageId: id }),
      setPreviewOpen: (open) => set({ isPreviewOpen: open }),
      resetEncoding: () =>
        set({
          viewMode: 'encode',
          encodingStatus: 'idle',
          encodedCarrierUrl: null,
          originalPreviewUrl: null,
          encodingError: null,
          pendingMessageId: null,
          isPreviewOpen: false,
        }),

      // Decoding
      decodingStatus: 'idle',
      decodingCarrierUrl: null,
      decodedImageUrl: null,
      senderPublicKey: null,
      decodingError: null,

      setDecodingStatus: (status) => set({ decodingStatus: status }),
      setDecodingCarrierUrl: (url) => set({ decodingCarrierUrl: url }),
      setDecodedImageUrl: (url) => set({ decodedImageUrl: url }),
      setSenderPublicKey: (key) => set({ senderPublicKey: key }),
      setDecodingError: (error) => set({ decodingError: error }),
      resetDecoding: () =>
        set({
          decodingStatus: 'idle',
          decodingCarrierUrl: null,
          decodedImageUrl: null,
          senderPublicKey: null,
          decodingError: null,
        }),
    }),
    { name: 'Nahan_SteganographyStore' }
  )
);
