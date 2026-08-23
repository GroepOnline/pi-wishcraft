import { currentQueueContext } from "../../../queue/store.ts";

export function getQueueSessionId(ctx: any): string | undefined {
  const sessionId = ctx.sessionManager?.getSessionId?.();
  return typeof sessionId === "string" && sessionId.trim()
    ? sessionId
    : undefined;
}

export function getQueueContext(ctx: any) {
  return currentQueueContext(ctx.cwd ?? process.cwd(), getQueueSessionId(ctx));
}
