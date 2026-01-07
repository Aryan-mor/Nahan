
// We cannot import DOM-dependent loggers here easily without a bridge.
// For now, we'll return errors to the main thread.

const ctx: Worker = self as unknown as Worker;

interface WorkerMessage {
  id: string;
  type: string;
  payload: unknown;
}

interface WorkerResponse {
  result: unknown;
  transferList: Transferable[];
}

const handleBase64ToBinary = (payload: unknown): WorkerResponse => {
  if (typeof payload !== 'object' || payload === null || !('base64' in payload)) {
    throw new Error('Invalid payload');
  }
  const base64Payload = payload as { base64: string };
  
  if (typeof base64Payload.base64 !== 'string') throw new Error('Invalid payload');

  const binaryString = atob(base64Payload.base64.split(',')[1] || base64Payload.base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return {
    result: bytes,
    transferList: [bytes.buffer]
  };
};

const handleBinaryToBase64 = (payload: unknown): WorkerResponse => {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new Error('Invalid payload');
  }
  const binaryPayload = payload as { data: Uint8Array };
  const { data } = binaryPayload;
  
  if (!(data instanceof Uint8Array)) throw new Error('Invalid payload: expected Uint8Array');

  let binary = '';
  const len = data.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  
  return {
    result: btoa(binary),
    transferList: []
  };
};

const processTask = (type: string, payload: unknown): WorkerResponse => {
  switch (type) {
    case 'base64ToBinary':
      return handleBase64ToBinary(payload);

    case 'binaryToBase64':
      return handleBinaryToBase64(payload);

    case 'encrypt':
    case 'decrypt':
      // Placeholder for crypto operations if we move tweetnacl-js here
      return { result: payload, transferList: [] };

    default:
      throw new Error(`Unknown task type: ${type}`);
  }
};

ctx.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data as WorkerMessage;

  try {
    const { result, transferList } = processTask(type, payload);

    ctx.postMessage({
      id,
      success: true,
      data: result
    }, transferList);

  } catch (error) {
    ctx.postMessage({
      id,
      success: false,
      error: (error as Error).message
    });
  }
};

export { };
