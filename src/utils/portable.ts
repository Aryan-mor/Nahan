import * as logger from './logger';

/**
 * Portable Build Utilities
 * Helpers for sharing and downloading the application as a single HTML file.
 */

/**
 * Share the current application file (Self-Replication)
 * Uses Web Share API to share the stored portable HTML file.
 */
export async function sharePortableFile(): Promise<boolean> {
  try {
    // Fetch the pre-built portable file from public directory
    const response = await fetch('/nahan-portable.html');
    if (!response.ok) {
      throw new Error('Portable file not found');
    }
    const blob = await response.blob();
    const file = new File([blob], 'nahan-portable.html', { type: 'text/html' });

    // Check if sharing is supported and valid
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Nahan Secure Messenger',
        text: 'Here is the offline secure messenger app.',
      });
      return true;
    }
  } catch (error) {
    // AbortError is common when user cancels share sheet
    if ((error as Error).name === 'AbortError') {
      return false;
    }
    logger.error('Share failed:', error);
    throw error;
  }
  return false;
}

/**
 * Download the current application file (Self-Replication)
 * Triggers a download of the stored portable HTML file.
 */
export async function downloadPortableFile(): Promise<void> {
  try {
    // Fetch the pre-built portable file from public directory
    const response = await fetch('/nahan-portable.html');
    if (!response.ok) {
      // Fallback to current HTML if file not found (dev mode or error)
      const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
      const blob = new Blob([html], { type: 'text/html' });
      triggerDownload(blob);
      return;
    }

    const blob = await response.blob();
    triggerDownload(blob);
  } catch (error) {
    logger.error('Download failed:', error);
    // Fallback
    const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    const blob = new Blob([html], { type: 'text/html' });
    triggerDownload(blob);
  }
}

function triggerDownload(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nahan-portable-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
