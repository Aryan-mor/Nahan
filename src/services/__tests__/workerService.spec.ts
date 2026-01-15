/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Worker Global
const mockPostMessage = vi.fn();
const mockTerminate = vi.fn();

class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  postMessage = mockPostMessage;
  terminate = mockTerminate;

  constructor(_url: string | URL) {}

  addEventListener(type: string, listener: any) {
    if (type === 'message') this.onmessage = listener;
  }
}

global.Worker = MockWorker as any;

// We need to reset modules to get a fresh Singleton for each test
beforeEach(() => {
  vi.resetModules();
  mockPostMessage.mockClear();
  mockTerminate.mockClear();
});

describe('WorkerService Priority Queue', () => {
  it('should process High priority tasks before Normal priority', async () => {
    // Import fresh module
    const { workerService } = await import('../workerService');
    const service: any = workerService; // Access private for testing if needed, or just observe behavior

    // 1. Simulate a "Busy" worker by NOT resolving the first task immediately
    // We send Task 1, which puts the worker in `isProcessing = true`

    // Service initializes in constructor
    const workerInstance = service.worker;

    // Helper to simulate worker response
    const respond = (id: string, data: any) => {
        workerInstance.onmessage({ data: { id, success: true, data } } as MessageEvent);
    };

    // Task 1: Normal (Starts immediately)
    const p1 = workerService.executeTask('task1', {}, { priority: 'normal' });
    const id1 = mockPostMessage.mock.calls[0][0].id;

    // Now worker is "processing" (isProcessing = true).

    // Task 2: Normal
    const p2 = workerService.executeTask('task2', {}, { priority: 'normal' });

    // Task 3: High
    const p3 = workerService.executeTask('task3', {}, { priority: 'high' });

    // Task 4: High (Latest)
    const p4 = workerService.executeTask('task4', {}, { priority: 'high' });

    // EXPECTED ORDER:
    // 1 (Already sent)
    // 4 (Latest High - LIFO)
    // 3 (Older High)
    // 2 (Normal)

    // Complete Task 1
    respond(id1, 'result1');
    await p1;

    // Check what was sent next. Should be Task 4.
    const call2 = mockPostMessage.mock.calls[1][0];
    expect(call2.type).toBe('task4');
    const id4 = call2.id;
    respond(id4, 'result4');
    await p4;

    // Check next: Task 3
    const call3 = mockPostMessage.mock.calls[2][0];
    expect(call3.type).toBe('task3');
    const id3 = call3.id;
    respond(id3, 'result3');
    await p3;

    // Check next: Task 2
    const call4 = mockPostMessage.mock.calls[3][0];
    expect(call4.type).toBe('task2');
    const id2 = call4.id;
    respond(id2, 'result2');
    await p2;
  });

  it('should support AbortController to remove from queue', async () => {
    const { workerService } = await import('../workerService');
    const service: any = workerService;
    const workerInstance = service.worker;

    const respond = (id: string, data: any) => {
        workerInstance.onmessage({ data: { id, success: true, data } } as MessageEvent);
    };

    // Task 1: Start to block
    const p1 = workerService.executeTask('task1', {}, { priority: 'normal' });
    const id1 = mockPostMessage.mock.calls[0][0].id;

    // Task 2: Enqueue then Abort
    const abortCtrl = new AbortController();
    const p2 = workerService.executeTask('task2', {}, { priority: 'normal', signal: abortCtrl.signal });

    // Abort Task 2
    abortCtrl.abort();

    // Task 3: Normal
    const p3 = workerService.executeTask('task3', {}, { priority: 'normal' });

    // Finish Task 1
    respond(id1, 'done');
    await p1;

    // Expect Task 2 to reject
    await expect(p2).rejects.toThrow('Aborted');

    // Expect Task 3 to run next (Task 2 should be skipped/removed)
    const call2 = mockPostMessage.mock.calls[1][0];
    expect(call2.type).toBe('task3');

    // Verify Task 2 was NEVER sent to worker
    const wasTask2Sent = mockPostMessage.mock.calls.some(call => call[0].type === 'task2');
    expect(wasTask2Sent).toBe(false);

    // Clean up p3 (optional, but good practice and fixes unused var)
    const id3 = call2.id;
    respond(id3, 'done3');
    await p3;
  });
});
