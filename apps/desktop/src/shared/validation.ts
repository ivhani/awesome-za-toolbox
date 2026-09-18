import { z } from "zod";

const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);

export const processFolderRequestSchema = z.object({
  requestId: identifier,
  selectionToken: identifier,
}).strict();

export const exportRequestSchema = z.object({
  sessionId: identifier,
  format: z.enum(["json", "csv"]),
}).strict();
