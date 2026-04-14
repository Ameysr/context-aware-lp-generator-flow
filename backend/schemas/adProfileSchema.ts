import { z } from "zod";

export const adProfileSchema = z.object({
  offer: z.string().max(100),
  headline: z.string().max(80),
  tone: z.enum(["professional", "casual", "urgent", "playful", "authoritative"]),
  audience: z.string().max(100),
  urgency_level: z.enum(["low", "medium", "high"]),
  cta_text: z.string().max(50),
  visual_theme: z.string().max(100),
  key_benefit: z.string().max(150),
});

export type AdProfile = z.infer<typeof adProfileSchema>;
