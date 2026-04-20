import { z } from 'zod';

export const GenerateNoteResponseSchema = z.object({
  note: z.string(),
  flags: z.array(z.string()),
});

export type GenerateNoteResult = z.infer<typeof GenerateNoteResponseSchema>;
