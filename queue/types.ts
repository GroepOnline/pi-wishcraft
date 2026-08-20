export type QueueIntent = "steer" | "follow-up" | "post-compact" | "idea";
export type QueueStatus = "queued" | "blocked" | "delivering" | "sent" | "failed";
/** Review language for captured ideas. Separate from delivery `QueueStatus`. */
export type IdeaReviewStatus = "idea" | "in-progress" | "done";
export const IDEA_REVIEW_STATUSES = [
  "idea",
  "in-progress",
  "done",
] as const satisfies readonly IdeaReviewStatus[];

export type QueueTarget =
  | { kind: "current-session" }
  | { kind: "project"; cwd: string; alias?: string }
  | { kind: "global" };

export interface QueueSource {
  cwd: string;
  sessionId?: string;
}

export interface PowerlineQueueItem {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  source: QueueSource;
  target: QueueTarget;
  intent: QueueIntent;
  status: QueueStatus;
  error?: string;
  reviewStatus?: IdeaReviewStatus;
  tags?: string[];
}

export interface QueueAliasMap {
  [alias: string]: string;
}

export interface QueueSummary {
  queueCount: number;
  ideaCount: number;
  blockedCount: number;
  compacting: boolean;
  leadingText: string | null;
  leadingIntent: QueueIntent | null;
  leadingStatus: QueueStatus | null;
}

export interface CreateQueueItemInput {
  text: string;
  source: QueueSource;
  target: QueueTarget;
  intent: QueueIntent;
  status?: QueueStatus;
  reviewStatus?: IdeaReviewStatus;
  tags?: string[];
  now?: number;
}

export interface QueueContext {
  cwd: string;
  sessionId?: string;
}

export const ACTIVE_QUEUE_STATUSES = new Set<QueueStatus>(["queued", "blocked", "delivering", "failed"]);
