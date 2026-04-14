import { z } from "zod";

export const personalizedCopySchema = z.object({
  new_hero_headline: z.string().max(80),
  new_subheadline: z.string().max(150),
  new_cta_text: z.string().max(50),
  new_value_props: z.array(z.string()).length(3),
  personalization_score: z.number().min(1).max(10),
  changes_made: z.array(z.string()),
});

export type PersonalizedCopy = z.infer<typeof personalizedCopySchema>;
