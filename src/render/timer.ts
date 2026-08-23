export interface RenderScheduler {
  schedule(delayMs?: number): void;
  cancel(): void;
}

export function createCoalescingTimer(render: () => void, defaultDelayMs: number): RenderScheduler {
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  let targetTime: number | null = null;
  let runId = 0;

  return {
    schedule(delayMs = defaultDelayMs) {
      const now = Date.now();
      const nextRunTime = now + delayMs;
      
      if (activeTimer !== null && targetTime !== null && targetTime <= nextRunTime) {
        return;
      }
      
      if (activeTimer !== null) {
        clearTimeout(activeTimer);
      }
      
      targetTime = nextRunTime;
      const currentRunId = ++runId;
      
      activeTimer = setTimeout(() => {
        if (currentRunId === runId) {
          activeTimer = null;
          targetTime = null;
          render();
        }
      }, delayMs);
    },
    cancel() {
      if (activeTimer !== null) {
        clearTimeout(activeTimer);
        activeTimer = null;
        targetTime = null;
      }
      runId++;
    }
  };
}

export const createRenderScheduler = createCoalescingTimer;
