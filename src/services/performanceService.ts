import { useAppStore } from '../stores/appStore';
import * as logger from '../utils/logger';
import { workerService } from './workerService';

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

class PerformanceService {
  private static instance: PerformanceService;
  private memoryInterval: NodeJS.Timeout | null = null;
  private readonly MEMORY_LIMIT_MB = 300; // As per verification criteria
  private readonly PANIC_THRESHOLD_GROWTH_MB = 70; // Per chat session
  private initialHeapSize = 0;

  private constructor() {}

  static getInstance(): PerformanceService {
    if (!PerformanceService.instance) {
      PerformanceService.instance = new PerformanceService();
    }
    return PerformanceService.instance;
  }

  startMonitoring() {
    if (this.memoryInterval) return;

    const perf = performance as unknown as PerformanceWithMemory;
    if (perf.memory) {
      this.initialHeapSize = perf.memory.usedJSHeapSize;
    }

    this.memoryInterval = setInterval(() => {
      this.checkSystemHealth();
    }, 10000); // Check every 10 seconds per strategy
  }

  stopMonitoring() {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
  }

  private checkSystemHealth() {
    // 1. Memory Check
    const perf = performance as unknown as PerformanceWithMemory;
    if (perf.memory) {
      const memory = perf.memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const growthMB = Math.round((memory.usedJSHeapSize - this.initialHeapSize) / 1024 / 1024);

      logger.debug(`[System Watchdog] Memory: ${usedMB}MB (Growth: ${growthMB}MB)`);

      if (growthMB > this.PANIC_THRESHOLD_GROWTH_MB) {
        logger.warn(`[System Watchdog] Memory growth exceeded threshold (${growthMB}MB > ${this.PANIC_THRESHOLD_GROWTH_MB}MB). Initiating PANIC MODE.`);
        this.triggerPanicMode();
      }

      if (usedMB > this.MEMORY_LIMIT_MB) {
        logger.error(`[System Watchdog] CRITICAL: Memory usage ${usedMB}MB exceeds hard limit ${this.MEMORY_LIMIT_MB}MB`);
        // We could trigger panic here too, or just warn aggressively
        this.triggerPanicMode();
      }
    }

    // 2. Worker Health Check
    // We can ping the worker or check active tasks duration in WorkerService if we expose it
    // For now we assume if memory is fine, worker is likely fine, or WorkerService handles its own timeouts.
  }

  private triggerPanicMode() {
    // "Panic Mode: If RAM growth > 70MB... clear the entire Zustand messages object and force a re-fetch"
    logger.warn('[System Watchdog] PANIC MODE ACTIVATED - CLEARING STORE');

    // Clear messages from store
    useAppStore.getState().clearAllMessages();

    // Restart worker to clear its heap
    workerService.restart();

    // Reset baseline
    const perf = performance as unknown as PerformanceWithMemory;
    if (perf.memory) {
      this.initialHeapSize = perf.memory.usedJSHeapSize;
    }

    // Force reload of active chat if any (which naturally happens if user is on chat page & components react to empty store)
    // The messages component should handle re-fetching or showing "Reloading..."
    const activeChat = useAppStore.getState().activeChat;
    if (activeChat) {
      useAppStore.getState().setActiveChat(activeChat);
    }
  }
}

export const performanceService = PerformanceService.getInstance();
