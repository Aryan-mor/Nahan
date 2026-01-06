/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, max-lines-per-function */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnifiedStealthDrawer } from '../UnifiedStealthDrawer';

// Mocks
const {
  mockSetShowStealthModal,
  mockConfirmStealthSend,
  mockGenerateMeshGradient,
  mockEmbedPayload,
  mockEncodeBase122,
  mockSendMessage,
} = vi.hoisted(() => ({
  mockSetShowStealthModal: vi.fn(),
  mockConfirmStealthSend: vi.fn(),
  mockGenerateMeshGradient: vi.fn(),
  mockEmbedPayload: vi.fn(),
  mockEncodeBase122: vi.fn(),
  mockSendMessage: vi.fn(),
}));

vi.mock('../../../stores/appStore', () => ({
  useAppStore: () => ({
    showStealthModal: true,
    setShowStealthModal: mockSetShowStealthModal,
    pendingStealthBinary: new Uint8Array([1, 2, 3]), // Mock binary data
    pendingStealthImage: null,
    confirmStealthSend: mockConfirmStealthSend,
    stealthDrawerMode: 'dual',
    pendingPlaintext: 'Secret Message',
    sendMessage: mockSendMessage,
  }),
}));

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: () => ({
    camouflageLanguage: 'en',
  }),
}));

vi.mock('../../../services/camouflage', () => ({
  camouflageService: {
    getRecommendedCover: vi.fn(() => 'Recommended Cover Text'),
    calculateStealthRatio: vi.fn(() => 85),
    embed: vi.fn(() => 'Hidden Message Output'),
  },
}));

vi.mock('../../../services/steganography/imageUtils', () => ({
  generateMeshGradient: mockGenerateMeshGradient,
}));

vi.mock('../../../services/steganography/base122', () => ({
  encodeBase122: mockEncodeBase122,
}));

vi.mock('../../../services/steganography/steganography', () => ({
  embedPayload: mockEmbedPayload,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal: string) => defaultVal || key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Setup Canvas Mock
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
})) as any;

HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

global.fetch = vi.fn(() =>
  Promise.resolve({
    blob: () => Promise.resolve(new Blob(['mock-content'], { type: 'image/png' })),
  })
) as any;

vi.mock('@heroui/react', () => {
  const React = require('react');
  return {
    Modal: ({ children, isOpen }: any) => (isOpen ? <div>{children}</div> : null),
    ModalContent: ({ children }: any) => <div>{typeof children === 'function' ? children(() => {}) : children}</div>,
    ModalHeader: ({ children }: any) => <div>{children}</div>,
    ModalBody: ({ children }: any) => <div>{children}</div>,
    ModalFooter: ({ children }: any) => <div>{children}</div>,
    Button: ({ children, onPress, onClick }: any) => <button onClick={onPress || onClick}>{children}</button>,
     Tabs: ({ children, onSelectionChange }: any) => (
       <div>
         {React.Children.map(children, (child: any) => (
           <div onClick={() => onSelectionChange && onSelectionChange(child.key)}>
             {child.props.title}
           </div>
         ))}
       </div>
     ),
     Tab: () => null,
     Textarea: (props: any) => <textarea {...props} />,
     Accordion: ({ children }: any) => <div>{children}</div>,
     AccordionItem: ({ children, title }: any) => (
       <div>
         <div>{title}</div>
         <div>{children}</div>
       </div>
     ),
   };
 });
 
 describe('UnifiedStealthDrawer', () => {
   beforeEach(() => {
     vi.clearAllMocks();
     mockGenerateMeshGradient.mockReturnValue(document.createElement('canvas'));
     mockEncodeBase122.mockReturnValue('encoded_base122');
     mockEmbedPayload.mockResolvedValue(new Blob(['mock_blob'], { type: 'image/png' }));
   });
 
   it('renders correctly in default dual mode (text tab)', async () => {
     render(<UnifiedStealthDrawer />);
     
     // Check Tabs
     await waitFor(() => {
       expect(screen.getByText('Hide in Text')).toBeInTheDocument();
     });
     expect(screen.getByText('Hide in Image')).toBeInTheDocument();
     
     // Check Text Mode content
     expect(screen.getByPlaceholderText('Enter text to hide your message...')).toBeInTheDocument();
     expect(screen.getByText('Recommended Cover Text')).toBeInTheDocument(); // Auto-filled
     expect(screen.getByText(/Security Score/)).toBeInTheDocument();
   });
 
   it('switches to Image tab and shows generator', async () => {
     render(<UnifiedStealthDrawer />);
     
     const imageTab = screen.getByText('Hide in Image');
     fireEvent.click(imageTab);
     
     expect(screen.getByText('Generate a unique gradient mask to hide your data.')).toBeInTheDocument();
     expect(screen.getByText('Generate Mask')).toBeInTheDocument();
     expect(screen.getByText('Upload Custom')).toBeInTheDocument();
   });
 
   it('generates mask and embeds data', async () => {
     render(<UnifiedStealthDrawer />);
     
     // Switch to Image Tab
     fireEvent.click(screen.getByText('Hide in Image'));
     
     // Click Generate
     const generateBtn = screen.getByText('Generate Mask');
     fireEvent.click(generateBtn);
     
     await waitFor(() => {
       expect(mockGenerateMeshGradient).toHaveBeenCalledWith(1080, 1080);
       expect(mockEncodeBase122).toHaveBeenCalled();
       expect(mockEmbedPayload).toHaveBeenCalled();
     });
     
     // Should show actions after generation
     await waitFor(() => {
       expect(screen.getByText('Download')).toBeInTheDocument();
       expect(screen.getByText('Copy')).toBeInTheDocument();
       expect(screen.getByText('Regenerate / Choose Different Image')).toBeInTheDocument();
     });
   });
 
   it('shows advanced options when no image is generated', () => {
     render(<UnifiedStealthDrawer />);
     fireEvent.click(screen.getByText('Hide in Image'));
     
     expect(screen.getByText(/Important: Always send this image/)).toBeInTheDocument();
     expect(screen.getByText('Learn More')).toBeInTheDocument();
  });

  it('sends stealth image directly using Send Now button', async () => {
    render(<UnifiedStealthDrawer />);
    
    // Switch to Image Tab
    fireEvent.click(screen.getByText('Hide in Image'));
    
    // Generate Image
    const generateBtn = screen.getByText('Generate Mask');
    fireEvent.click(generateBtn);
    
    await waitFor(() => {
      expect(screen.getByText('Send Now')).toBeInTheDocument();
    });
    
    // Click Send Now
    const sendBtn = screen.getByText('Send Now');
    fireEvent.click(sendBtn);
    
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('data:'), // FileReader result
        'image_stego'
      );
    });
  });
});
