import { z } from "zod";

export const croSuggestionSchema = z.object({
  severity: z.enum(["critical", "warning", "good"]),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  fix: z.string(),
});

export const croAnalysisSchema = z.object({
  overall_score: z.number().min(1).max(10),
  summary: z.string(),
  suggestions: z.array(croSuggestionSchema).min(2).max(3),
});

export type CROSuggestion = z.infer<typeof croSuggestionSchema>;
export type CROAnalysis = z.infer<typeof croAnalysisSchema>;
