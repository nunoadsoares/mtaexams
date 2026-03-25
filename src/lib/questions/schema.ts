import { z } from "zod";

export const normalizedOptionSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
});

export const normalizedQuestionSchema = z.object({
  prompt: z.string().min(8),
  correctAnswer: z.string().min(1),
  correctAnswers: z.array(z.string().min(1)).min(1),
  explanation: z.string().optional(),
  topic: z.string().default("General"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  questionType: z.enum(["multiple_choice", "multiple_select"]).default("multiple_choice"),
  options: z.array(normalizedOptionSchema).min(2),
});

export const normalizedQuestionsSchema = z.array(normalizedQuestionSchema);

export type NormalizedQuestion = z.infer<typeof normalizedQuestionSchema>;
