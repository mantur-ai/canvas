import { z } from "zod";

export const agentRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  icon: z.string().trim().max(512).optional().default(""),
  description: z.string().trim().max(280).optional().default(""),
});

export const agentDbSchema = z.object({
  agents: z.array(agentRecordSchema),
});

export const createAgentInputSchema = agentRecordSchema.omit({
  id: true,
});

export const updateAgentInputSchema = agentRecordSchema;

export type AgentRecord = z.infer<typeof agentRecordSchema>;
export type AgentDb = z.infer<typeof agentDbSchema>;
export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>;
