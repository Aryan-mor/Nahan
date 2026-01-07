import * as logger from '../utils/logger';

// Maximum concurrent tasks as per strategy
const MAX_CONCURRENT_TASKS = 2;

export type WorkerTaskType =
  | 'decrypt'
  | 'encrypt'
  | 'steganography'
  | 'image_process'
  | 'base64ToBinary'
  | 'binaryToBase64';

export interface WorkerTask<T = unknown> {
  id: string;
  type: WorkerTaskType;
  payload: unknown;
  transferList?: Transferable[];
  priority: 'HIGH' | 'NORMAL';
  abortSignal?: AbortSignal;
  resolve: (value: T) => void;
  reject: (reason: Error | DOMException) => void;
}

export interface WorkerExecutionOptions {
  priority?: 'HIGH' | 'NORMAL';
  transferList?: Transferable[];
  signal?: AbortSignal;
}

export class WorkerService {
  private static instance: WorkerService;
  private worker: Worker | null = null;
  private activeTaskCount = 0;
  private pendingQueue: WorkerTask[] = [];
  private taskMap = new Map<string, WorkerTask>();

  private constructor() {
    this.initializeWorker();
  }

  static getInstance(): WorkerService {
    if (!WorkerService.instance) {
      WorkerService.instance = new WorkerService();
    }
    return WorkerService.instance;
  }

  private initializeWorker() {
    // We'll assume the worker is at the standard Vite worker location
    this.worker = new Worker(new URL('../workers/processing.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = this.handleWorkerError.bind(this);
  }

  private handleWorkerMessage(event: MessageEvent) {
    const { id, success, data, error } = event.data;
    const task = this.taskMap.get(id);

    if (task) {
      this.taskMap.delete(id);
      this.activeTaskCount--;

      if (success) {
        task.resolve(data);
      } else {
        task.reject(new Error(error));
      }

      this.processQueue();
    }
  }

  private handleWorkerError(error: ErrorEvent) {
    logger.error('Worker Error:', error);
    // Determine which task caused it if possible, or reset
  }

  private processQueue() {
    if (this.activeTaskCount >= MAX_CONCURRENT_TASKS || this.pendingQueue.length === 0) {
      return;
    }

    const task = this.pendingQueue.shift();
    if (!task) return;

    if (task.abortSignal?.aborted) {
      task.reject(new DOMException('Aborted', 'AbortError'));
      this.processQueue(); // Try next
      return;
    }

    this.activeTaskCount++;
    this.taskMap.set(task.id, task);

    this.worker?.postMessage(
      {
        id: task.id,
        type: task.type,
        payload: task.payload,
      },
      task.transferList || [],
    );
  }

  /**
   * Schedule a task on the worker.
   */
  execute<T>(
    type: WorkerTaskType,
    payload: unknown,
    options: WorkerExecutionOptions = {},
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const task: WorkerTask<T> = {
        id,
        type,
        payload,
        transferList: options.transferList,
        priority: options.priority || 'NORMAL',
        abortSignal: options.signal,
        resolve,
        reject,
      };

      this.setupAbortSignal(task, options.signal, reject);
      this.enqueueTask(task);
      this.processQueue();
    });
  }

  private setupAbortSignal<T>(
    task: WorkerTask<T>,
    signal: AbortSignal | undefined,
    reject: (reason: Error | DOMException) => void,
  ) {
    if (!signal) return;

    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    signal.addEventListener('abort', () => {
      const index = this.pendingQueue.indexOf(task as WorkerTask);
      if (index !== -1) {
        this.pendingQueue.splice(index, 1);

        // Release binary references
        task.payload = null;
        task.transferList = undefined;

        logger.debug(`[WorkerService] Task ${task.id} aborted and removed from queue.`);
        reject(new DOMException('Aborted', 'AbortError'));
      }
    });
  }

  private enqueueTask(task: WorkerTask) {
    if (task.priority === 'HIGH') {
      const lastHighIndex = this.findLastHighPriorityIndex();
      if (lastHighIndex === -1) {
        this.pendingQueue.unshift(task);
      } else {
        this.pendingQueue.splice(lastHighIndex + 1, 0, task);
      }
    } else {
      this.pendingQueue.push(task);
    }
  }

  private findLastHighPriorityIndex(): number {
    let lastHighIndex = -1;
    for (let i = this.pendingQueue.length - 1; i >= 0; i--) {
      if (this.pendingQueue[i].priority === 'HIGH') {
        lastHighIndex = i;
        break;
      }
    }
    return lastHighIndex;
  }

  /**
   * Terminate and restart the worker (Watchdog use)
   */
  restart() {
    logger.warn('[WorkerService] Restarting worker...');
    this.worker?.terminate();
    this.taskMap.forEach((task) => task.reject(new Error('Worker terminated via watchdog')));
    this.taskMap.clear();
    this.pendingQueue = [];
    this.activeTaskCount = 0;
    this.initializeWorker();
  }
}

export const workerService = WorkerService.getInstance();
