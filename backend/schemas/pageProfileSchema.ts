import { z } from "zod";

export const elementSelectorsSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  ctaButtons: z.array(z.string()),
  valueProps: z.array(z.string()),
});

export const pageProfileSchema = z.object({
  hero_headline: z.string(),
  subheadline: z.string(),
  value_props: z.array(z.string()).max(5),
  cta_text: z.string(),
  current_tone: z.string(),
  page_url: z.string().url(),
});

export type PageProfile = z.infer<typeof pageProfileSchema>;
export type ElementSelectorsType = z.infer<typeof elementSelectorsSchema>;
