import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts a Data URI to a Blob without using the fetch API.
 * This ensures 100% offline compliance and avoids "Network Activity" flags from security scanners.
 *
 * @param dataURI - The Data URI string (e.g., "data:image/png;base64,iVBORw0KGgo...")
 * @returns A Blob containing the decoded binary data
 */
export function dataURItoBlob(dataURI: string): Blob {
  // 1. Split the Data URI to get the MIME type and the Base64 data
  const splitDataURI = dataURI.split(',');

  if (splitDataURI.length !== 2) {
    throw new Error('Invalid Data URI format');
  }

  const byteString = atob(splitDataURI[1]);
  const mimeString = splitDataURI[0].split(':')[1].split(';')[0];

  // 2. Write the bytes of the string to an ArrayBuffer
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  // 3. Create a Blob from the ArrayBuffer
  return new Blob([ab], { type: mimeString });
}
