import * as cheerio from "cheerio";
import type { PersonalizedCopy } from "../schemas/personalizedCopySchema";
import type { ElementSelectors } from "../scrapers/pageScraper";

/**
 * Surgically inject personalized copy into the original page's HTML.
 * Uses CSS selectors first, falls back to text-content matching.
 * Preserves inner HTML structure (icons, SVGs inside buttons).
 */
export function injectPersonalizedCopy(
  originalHTML: string,
  personalizedCopy: PersonalizedCopy,
  selectors: ElementSelectors,
  baseUrl: string
): string {
  console.log("[HTML INJECTOR] Starting surgical text injection...");
  const $ = cheerio.load(originalHTML);

  let changesApplied = 0;

  // === HELPER: Try selector first, then fall back to text-content search, then grab first tag ===
  function findAndReplace(
    label: string,
    selector: string,
    originalTextHint: string,
    newText: string,
    tagHints: string[] // e.g. ["h1", "h2"] to search in if selector fails
  ): boolean {
    // Strategy 1: Use the CSS selector directly
    if (selector) {
      try {
        const el = $(selector).first();
        if (el.length > 0) {
          const innerText = el.text().trim();
          if (innerText.length > 0) {
            replaceTextPreservingStructure($, el, newText);
            console.log(`[HTML INJECTOR]    ${label} (selector): "${innerText.substring(0, 40)}..." → "${newText.substring(0, 40)}..."`);
            return true;
          }
        }
      } catch (e: any) {
        console.warn(`[HTML INJECTOR]    ${label} selector failed: ${e.message}`);
      }
    }

    // Strategy 2: Search by original text content in common tags
    if (originalTextHint && originalTextHint.length > 3) {
      for (const tag of tagHints) {
        const elements = $(tag);
        let found = false;
        elements.each((_i, elem) => {
          if (found) return;
          const el = $(elem);
          const text = el.text().trim();
          if (text && (
            text === originalTextHint ||
            text.includes(originalTextHint) ||
            originalTextHint.includes(text)
          )) {
            replaceTextPreservingStructure($, el, newText);
            console.log(`[HTML INJECTOR]    ${label} (text-match in <${tag}>): "${text.substring(0, 40)}..." → "${newText.substring(0, 40)}..."`);
            found = true;
          }
        });
        if (found) return true;
      }
    }

    // Strategy 3: Grab the first visible element of the first tag hint (e.g., first h1 on page)
    for (const tag of tagHints) {
      const elements = $(tag);
      let found = false;
      elements.each((_i, elem) => {
        if (found) return;
        const el = $(elem);
        const text = el.text().trim();
        // Pick the first element with substantial text (skip empty or tiny ones)
        if (text && text.length > 1) {
          replaceTextPreservingStructure($, el, newText);
          console.log(`[HTML INJECTOR]    ${label} (first-<${tag}> fallback): "${text.substring(0, 40)}..." → "${newText.substring(0, 40)}..."`);
          found = true;
        }
      });
      if (found) return true;
    }

    console.warn(`[HTML INJECTOR]    ${label}: Could not find element (selector: "${selector}", hint: "${originalTextHint?.substring(0, 30)}")`);
    return false;
  }

  // === Apply replacements ===

  // 1. Hero headline
  if (personalizedCopy.new_hero_headline) {
    if (findAndReplace(
      "Headline",
      selectors.headline,
      "", // Text hint is optional — Strategy 3 will find first h1
      personalizedCopy.new_hero_headline,
      ["h1"]
    )) {
      changesApplied++;
    }
  }

  // 2. Subheadline
  if (personalizedCopy.new_subheadline) {
    if (findAndReplace(
      "Subheadline",
      selectors.subheadline,
      "",
      personalizedCopy.new_subheadline,
      ["h2", "h3", "p"]
    )) {
      changesApplied++;
    }
  }

  // 3. CTA button — special handling to preserve icons
  if (personalizedCopy.new_cta_text && selectors.ctaButtons.length > 0) {
    let ctaReplaced = false;

    for (const ctaSel of selectors.ctaButtons) {
      if (ctaReplaced) break;
      try {
        const el = $(ctaSel).first();
        if (el.length > 0) {
          const original = el.text().trim();
          if (original.length > 0) {
            // For buttons/links: replace only text nodes, keep icons/SVGs
            replaceTextPreservingStructure($, el, personalizedCopy.new_cta_text);
            console.log(`[HTML INJECTOR]    CTA: "${original}" → "${personalizedCopy.new_cta_text}"`);
            changesApplied++;
            ctaReplaced = true;
          }
        }
      } catch (e: any) {
        console.warn(`[HTML INJECTOR]    CTA selector failed: ${e.message}`);
      }
    }

    // Fallback: search for common CTA patterns
    if (!ctaReplaced) {
      const ctaCandidates = $('a[class*="btn"], a[class*="cta"], a[class*="button"], button[class*="primary"], a[class*="primary"]');
      ctaCandidates.each((_i, elem) => {
        if (ctaReplaced) return;
        const el = $(elem);
        const text = el.text().trim();
        if (text.length > 2 && text.length < 60) {
          // Check if it's above-the-fold (first occurrence)
          replaceTextPreservingStructure($, el, personalizedCopy.new_cta_text);
          console.log(`[HTML INJECTOR]    CTA (fallback): "${text}" → "${personalizedCopy.new_cta_text}"`);
          changesApplied++;
          ctaReplaced = true;
        }
      });
    }
  }

  // 4. Value props
  if (personalizedCopy.new_value_props.length > 0 && selectors.valueProps.length > 0) {
    const propsToReplace = Math.min(selectors.valueProps.length, personalizedCopy.new_value_props.length);
    for (let i = 0; i < propsToReplace; i++) {
      try {
        const el = $(selectors.valueProps[i]).first();
        if (el.length > 0) {
          const original = el.text().trim();
          replaceTextPreservingStructure($, el, personalizedCopy.new_value_props[i]);
          console.log(`[HTML INJECTOR]    ValueProp[${i}]: "${original.substring(0, 30)}..." → "${personalizedCopy.new_value_props[i].substring(0, 30)}..."`);
          changesApplied++;
        }
      } catch (e: any) {
        console.warn(`[HTML INJECTOR]    ValueProp[${i}] injection failed: ${e.message}`);
      }
    }
  }

  // 5. Add a subtle indicator badge
  const badge = `
    <div id="adsync-personalized-badge" style="
      position: fixed; bottom: 16px; right: 16px; z-index: 99999;
      background: linear-gradient(135deg, #6366f1, #a78bfa);
      color: white; padding: 8px 16px; border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
      box-shadow: 0 4px 12px rgba(99,102,241,0.3);
      pointer-events: none; opacity: 0.9;
    ">Personalized by AdSync</div>
  `;
  $("body").append(badge);

  // 6. Remove scripts/popups that break iframe rendering
  $("script[src*='analytics']").remove();
  $("script[src*='gtag']").remove();
  $("script[src*='gtm']").remove();
  $("script[src*='facebook']").remove();
  $("script[src*='hotjar']").remove();
  $("script[src*='intercom']").remove();
  $("script[src*='drift']").remove();
  $("script[src*='chat']").remove();
  $("[class*='popup']").remove();
  $("[class*='modal']").remove();
  $("[class*='cookie']").remove();
  $("[class*='consent']").remove();
  $("[class*='overlay']").remove();
  $("[class*='banner']").filter((_i, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes("cookie") || text.includes("consent") || text.includes("accept");
  }).remove();

  console.log(`[HTML INJECTOR] Done — ${changesApplied} text replacements applied`);
  return $.html();
}

/**
 * Replace text content while preserving child element structure (SVGs, icons, spans).
 * Finds the deepest text-containing element and replaces its text.
 */
function replaceTextPreservingStructure(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<any>,
  newText: string
): void {
  // If element has no children, just set text directly
  const children = el.children();
  if (children.length === 0) {
    el.text(newText);
    return;
  }

  // Find direct text nodes (not in child elements)
  const contents = el.contents();
  let replacedTextNode = false;

  contents.each((_i, node) => {
    if (replacedTextNode) return;
    if (node.type === "text") {
      const textContent = (node as any).data?.trim();
      if (textContent && textContent.length > 1) {
        (node as any).data = newText;
        replacedTextNode = true;
      }
    }
  });

  // If no direct text node found, find the deepest child with text
  if (!replacedTextNode) {
    // Look for span or text-containing child
    const textChild = el.find("span, em, strong, b").first();
    if (textChild.length > 0 && textChild.children().length === 0) {
      textChild.text(newText);
      return;
    }

    // Last resort: replace all text but this may strip icons
    // Only do this if the element is simple enough
    if (children.length <= 2) {
      // Keep first child (might be icon), replace text
      let replaced = false;
      contents.each((_i, node) => {
        if (replaced) return;
        if (node.type === "text") {
          (node as any).data = ` ${newText} `;
          replaced = true;
        }
      });
      if (!replaced) {
        // Really last resort
        el.text(newText);
      }
    }
  }
}
