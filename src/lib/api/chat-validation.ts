import { z } from 'zod';

export const CreateConversationSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
});

export const UpdateConversationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
});

export const StreamMessageSchema = z.object({
  message: z.string().min(1, 'Message is required'),
});
