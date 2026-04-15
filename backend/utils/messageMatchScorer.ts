import type { AdProfile } from "../schemas/adProfileSchema";
import type { PersonalizedCopy } from "../schemas/personalizedCopySchema";

/**
 * Deterministic Message Match Scorer
 *
 * Computes a percentage score (0–100%) measuring how well the personalized copy
 * aligns with the original ad creative. Unlike the LLM's subjective personalization_score,
 * this is a repeatable, explainable metric based on token overlap.
 *
 * Three layers scored independently, then weighted:
 *   1. Headline Match (40%) — Jaccard similarity of ad headline vs generated headline
 *   2. Offer/CTA Match (30%) — Ad offer keywords appearing in CTA text
 *   3. Benefit/ValueProp Match (30%) — Ad benefit keywords appearing in value props
 */

interface MessageMatchResult {
  overall: number; // 0–100
  headlineMatch: number; // 0–100
  offerMatch: number; // 0–100
  benefitMatch: number; // 0–100
  breakdown: string[]; // human-readable explanations
}

// Stopwords to ignore (they inflate similarity without meaning)
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "as", "into", "through", "during", "before", "after",
  "it", "its", "this", "that", "these", "those", "your", "our", "my",
  "you", "we", "they", "he", "she", "not", "no", "do", "does", "did",
  "will", "would", "could", "should", "shall", "can", "may", "might",
  "have", "has", "had", "so", "if", "than", "too", "very", "just",
]);

/**
 * Tokenize text into a set of meaningful lowercase words
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  );
}

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Coverage: what % of tokens in 'source' appear in 'target'
 */
function coverage(source: Set<string>, target: Set<string>): number {
  if (source.size === 0) return 1;
  const found = [...source].filter((w) => target.has(w));
  return found.length / source.size;
}

export function computeMessageMatch(
  adProfile: AdProfile,
  personalizedCopy: PersonalizedCopy
): MessageMatchResult {
  const breakdown: string[] = [];

  // --- Layer 1: Headline Match (40% weight) ---
  const adHeadlineTokens = tokenize(adProfile.headline);
  const genHeadlineTokens = tokenize(personalizedCopy.new_hero_headline);
  const headlineSimilarity = jaccard(adHeadlineTokens, genHeadlineTokens);
  const headlineMatch = Math.round(headlineSimilarity * 100);

  const headlineOverlap = [...adHeadlineTokens].filter((w) => genHeadlineTokens.has(w));
  if (headlineOverlap.length > 0) {
    breakdown.push(`Headline: ${headlineOverlap.length}/${adHeadlineTokens.size} ad keywords matched (${headlineMatch}%)`);
  } else {
    breakdown.push(`Headline: No direct keyword overlap with ad headline`);
  }

  // --- Layer 2: Offer/CTA Match (30% weight) ---
  const offerTokens = tokenize(adProfile.offer + " " + adProfile.cta_text);
  const ctaTokens = tokenize(personalizedCopy.new_cta_text + " " + personalizedCopy.new_subheadline);
  const offerCoverage = coverage(offerTokens, ctaTokens);
  const offerMatch = Math.round(offerCoverage * 100);

  breakdown.push(`Offer/CTA: ${Math.round(offerCoverage * 100)}% of ad offer terms reflected in CTA + subheadline`);

  // --- Layer 3: Benefit/ValueProp Match (30% weight) ---
  const benefitTokens = tokenize(adProfile.key_benefit + " " + adProfile.offer);
  const vpText = personalizedCopy.new_value_props.join(" ") + " " + personalizedCopy.new_subheadline;
  const vpTokens = tokenize(vpText);
  const benefitCoverage = coverage(benefitTokens, vpTokens);
  const benefitMatch = Math.round(benefitCoverage * 100);

  breakdown.push(`Benefit: ${Math.round(benefitCoverage * 100)}% of ad benefits present in value props`);

  // --- Weighted overall ---
  const overall = Math.round(
    headlineMatch * 0.4 + offerMatch * 0.3 + benefitMatch * 0.3
  );

  console.log(`[MESSAGE MATCH] 📊 Score: ${overall}%`);
  console.log(`[MESSAGE MATCH]    Headline: ${headlineMatch}% (Jaccard)`);
  console.log(`[MESSAGE MATCH]    Offer/CTA: ${offerMatch}% (Coverage)`);
  console.log(`[MESSAGE MATCH]    Benefit: ${benefitMatch}% (Coverage)`);

  return { overall, headlineMatch, offerMatch, benefitMatch, breakdown };
}
