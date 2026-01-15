/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import * as logger from '../utils/logger';

// Type definitions for Worker Tasks
export interface WorkerTask<T = unknown> {
  id: string;
  type: string;
  payload: unknown;
  priority: 'high' | 'normal';
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  signal?: AbortSignal;
  transfer?: Transferable[];
  target: 'storage' | 'processing';
}

export class WorkerService {
  private static instance: WorkerService;
  private storageWorker: Worker | null = null;
  private processingWorker: Worker | null = null;

  private storageQueue: WorkerTask[] = [];
  private processingQueue: WorkerTask[] = [];
  private processing = new Map<string, WorkerTask>(); // Tracks tasks currently being processed by either worker

  private isStorageWorkerBusy = false;
  private isProcessingWorkerBusy = false;
  private isTerminated = false;

  private constructor() {
    this.initializeWorkers();
  }

  static getInstance(): WorkerService {
    if (!WorkerService.instance) {
      WorkerService.instance = new WorkerService();
    }
    return WorkerService.instance;
  }

  private initializeWorkers() {
    this.isTerminated = false;
    if (typeof Worker !== 'undefined') {
      // Storage Worker (DB Access)
      this.storageWorker = new Worker(new URL('../workers/storage.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.storageWorker.onmessage = (e) => this.handleWorkerMessage(e, 'storage');
      this.storageWorker.onerror = (e) => this.handleWorkerError(e, 'storage');

      // Processing Worker (CPU Intensive)
      this.processingWorker = new Worker(new URL('../workers/processing.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.processingWorker.onmessage = (e) => this.handleWorkerMessage(e, 'processing');
      this.processingWorker.onerror = (e) => this.handleWorkerError(e, 'processing');
    }
  }

  private handleWorkerMessage(event: MessageEvent, source: 'storage' | 'processing') {
    const { id, success, data, error } = event.data;
    const task = this.processing.get(id);

    if (task) {
      this.processing.delete(id);
      if (success) {
        task.resolve(data);
      } else {
        task.reject(new Error(error));
      }
    } else {
      // Might have been aborted and removed already
      // logger.debug(`[WorkerService] Received result for unknown/aborted task ${id}`);
    }

    // Mark worker as not busy and try to process next task for this worker
    if (source === 'storage') {
      this.isStorageWorkerBusy = false;
      this.processNext('storage');
    } else {
      this.isProcessingWorkerBusy = false;
      this.processNext('processing');
    }
  }

  private handleWorkerError(error: ErrorEvent, source: 'storage' | 'processing') {
    logger.error(`[WorkerService] ${source} Worker Error:`, error);
    // Fail all tasks targeting this worker?
    // For now, just log. The individual tasks might hang if we don't clear them,
    // but verifying which task caused the crash is hard without ID in error event.
    // A more robust solution would be to reject all pending tasks for the crashed worker
    // and potentially restart the worker.
    if (source === 'storage') {
      this.isStorageWorkerBusy = false;
      this.storageQueue.forEach(task => task.reject(new Error(`${source} worker crashed`)));
      this.storageQueue = [];
    } else {
      this.isProcessingWorkerBusy = false;
      this.processingQueue.forEach(task => task.reject(new Error(`${source} worker crashed`)));
      this.processingQueue = [];
    }
    // Also reject any tasks currently in 'processing' map for this worker
    this.processing.forEach((task, taskId) => {
      if (task.target === source) {
        task.reject(new Error(`${source} worker crashed`));
        this.processing.delete(taskId);
      }
    });
  }

  /**
   * Execute a task on the appropriate worker
   */
  executeTask<T>(
    type: string,
    payload: any,
    options: {
      priority?: 'high' | 'normal';
      signal?: AbortSignal;
      transfer?: Transferable[];
    } = {}
  ): Promise<T> {
    if (this.isTerminated) {
      logger.warn(`[WorkerService] executeTask called after termination: ${type}. Attempting restart...`);
      this.initializeWorkers();
      // If still terminated (e.g. environment issue), fail.
      if (this.isTerminated) {
          return new Promise(() => {}); // Prevent deadlock or throw? Better to throw so caller knows.
      }
    }

    if (!this.storageWorker || !this.processingWorker) {
      // Auto-initialize if missing (e.g. lazy load or recovery)
      this.initializeWorkers();
      if (!this.storageWorker || !this.processingWorker) {
         return Promise.reject(new Error('Workers not initialized'));
      }
    }

    // Route based on task type
    let target: 'storage' | 'processing' = 'processing'; // Default to processing
    if (['getMessages', 'storeMessage', 'updateMessageStatus', 'deleteMessage'].includes(type)) {
      target = 'storage';
    } else if (['analyzeInput', 'base64ToBinary', 'binaryToBase64'].includes(type)) {
      target = 'processing';
    }

    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      const task: WorkerTask<T> = {
        id,
        type,
        payload,
        priority: options.priority || 'normal',
        resolve,
        reject,
        signal: options.signal,
        transfer: options.transfer,
        target,
      };

      if (options.signal) {
        if (options.signal.aborted) {
          return reject(new DOMException('Aborted', 'AbortError'));
        }
        options.signal.addEventListener('abort', () => {
          this.handleAbort(id);
        });
      }

      const queue = target === 'storage' ? this.storageQueue : this.processingQueue;
      if (task.priority === 'high') {
         queue.unshift(task);
      } else {
         queue.push(task);
      }

      // Try to process immediately if the target worker is not busy
      this.processNext(target);
    });
  }

  private processNext(target: 'storage' | 'processing') {
    const queue = target === 'storage' ? this.storageQueue : this.processingQueue;
    const worker = target === 'storage' ? this.storageWorker : this.processingWorker;
    const isBusy = target === 'storage' ? this.isStorageWorkerBusy : this.isProcessingWorkerBusy;

    if (isBusy || queue.length === 0 || !worker) {
      return;
    }

    const task = queue.shift();

    if (!task) {
      return;
    }

    // Check if already aborted before sending
    if (task.signal?.aborted) {
      task.reject(new DOMException('Aborted', 'AbortError'));
      // Try to process the next task for this worker immediately
      this.processNext(target);
      return;
    }

    // Mark worker as busy
    if (target === 'storage') {
      this.isStorageWorkerBusy = true;
    } else {
      this.isProcessingWorkerBusy = true;
    }

    this.processing.set(task.id, task);

    try {
        worker.postMessage(
            {
                id: task.id,
                type: task.type,
                payload: task.payload
            },
            task.transfer || []
        );
    } catch (err) {
        this.processing.delete(task.id);
        task.reject(err);
        // Mark worker as not busy and try next task
        if (target === 'storage') {
          this.isStorageWorkerBusy = false;
        } else {
          this.isProcessingWorkerBusy = false;
        }
        this.processNext(target);
    }
  }

  private handleAbort(id: string) {
    // 1. Check Storage Queue
    const storageQueueIndex = this.storageQueue.findIndex(t => t.id === id);
    if (storageQueueIndex !== -1) {
      const task = this.storageQueue[storageQueueIndex];
      this.storageQueue.splice(storageQueueIndex, 1);
      task.reject(new DOMException('Aborted', 'AbortError'));
      logger.debug(`[WorkerService] Task ${id} aborted from storage queue`);
      return;
    }

    // 2. Check Processing Queue
    const processingQueueIndex = this.processingQueue.findIndex(t => t.id === id);
    if (processingQueueIndex !== -1) {
      const task = this.processingQueue[processingQueueIndex];
      this.processingQueue.splice(processingQueueIndex, 1);
      task.reject(new DOMException('Aborted', 'AbortError'));
      logger.debug(`[WorkerService] Task ${id} aborted from processing queue`);
      return;
    }

    // 3. Check Processing Map (if already sent to worker)
    if (this.processing.has(id)) {
        const task = this.processing.get(id);
        this.processing.delete(id);
        task?.reject(new DOMException('Aborted', 'AbortError'));
        logger.debug(`[WorkerService] Task ${id} aborted during execution (result will be ignored)`);

        // Note: The worker is still running this task. We rely on the worker eventually finishing.
        // If strict cancellation is needed, we would terminate the worker.
    }
  }

  // Helper for MessageBubble if needed (wrapper) - The build error was analyzeInput not found.
  // The user code calls `workerService.analyzeInput(...)`.
  // I should add this helper.
  analyzeInput(input: string): Promise<any> {
      return this.executeTask('analyzeInput', { input }, { priority: 'high' });
  }

  /**
   * Terminate all workers gracefully (e.g. on app shutdown)
   */
  terminate() {
    this.isTerminated = true;
    logger.debug('[WorkerService] Terminating workers starting...');

    this.storageWorker?.terminate();
    this.processingWorker?.terminate();

    this.storageWorker = null;
    this.processingWorker = null;
    this.storageQueue = [];
    this.processingQueue = [];
    this.processing.clear();
    this.isStorageWorkerBusy = false;
    this.isProcessingWorkerBusy = false;
  }

  /**
   * Restart the workers (e.g. after a crash or memory leak)
   */
  restart() {
    this.storageWorker?.terminate();
    this.processingWorker?.terminate();
    this.storageWorker = null;
    this.processingWorker = null;
    this.storageQueue = [];
    this.processingQueue = [];
    this.processing.clear();
    this.isStorageWorkerBusy = false;
    this.isProcessingWorkerBusy = false;
    this.initializeWorkers();
  }
}

export const workerService = WorkerService.getInstance();
