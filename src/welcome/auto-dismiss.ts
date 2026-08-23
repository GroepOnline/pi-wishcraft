export interface WelcomeDismissScheduler<Context> {
  schedule(ctx: Context): void;
  cancel(): void;
}

interface WelcomeDismissSchedulerOptions<Context> {
  dismiss(ctx: Context): void;
  getGeneration(): number;
  isEnabled(): boolean;
}

export function createWelcomeDismissScheduler<Context>(
  options: WelcomeDismissSchedulerOptions<Context>,
): WelcomeDismissScheduler<Context> {
  let activeTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(ctx) {
      if (activeTimer !== null) {
        return;
      }

      const capturedGeneration = options.getGeneration();

      activeTimer = setTimeout(() => {
        activeTimer = null;

        if (!options.isEnabled() || capturedGeneration !== options.getGeneration()) {
          return;
        }

        options.dismiss(ctx);
      }, 0);
    },
    cancel() {
      if (activeTimer === null) {
        return;
      }
      clearTimeout(activeTimer);
      activeTimer = null;
    },
  };
}
