import axios from "axios";
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

export interface ElementSelectors {
  headline: string;
  subheadline: string;
  ctaButtons: string[];
  valueProps: string[];
}

export interface ScrapedPage {
  title: string;
  h1: string;
  h2: string;
  paragraphs: string;
  buttons: string;
  metaDesc: string;
  rawText: string;
  screenshotBase64: string;
  brandColors: {
    primary: string;
    background: string;
    text: string;
  };
  faviconUrl: string;
  // NEW — for same-page injection
  fullHTML: string;
  elementSelectors: ElementSelectors;
  baseUrl: string;
}

// ---------- Helper: Generate a unique CSS selector for a Cheerio element ----------
function getSelector($: cheerio.CheerioAPI, el: DomElement): string {
  const $el = $(el);

  // Try ID first
  const id = $el.attr("id");
  if (id) return `#${id}`;

  // Try unique class combination — filter out Tailwind/special classes
  const classAttr = $el.attr("class");
  if (classAttr) {
    const safeClasses = classAttr
      .split(/\s+/)
      .filter((c: string) => c.length > 0 && !/[:\[\]\/\\@!#$%^&*()+={}|<>?,]/.test(c));
    if (safeClasses.length > 0) {
      const tag = el.tagName?.toLowerCase() || "div";
      const classSelector = `${tag}.${safeClasses.join(".")}`;
      try {
        if ($(classSelector).length === 1) {
          return classSelector;
        }
      } catch {
        // Selector invalid — fall through
      }
    }
  }

  // Use nth-of-type path
  const parts: string[] = [];
  let current: DomElement | null = el;
  while (current && current.tagName) {
    const tag = current.tagName.toLowerCase();
    if (tag === "html" || tag === "body") break;

    const currentId = $(current).attr("id");
    if (currentId) {
      parts.unshift(`#${currentId}`);
      break;
    }

    let selector = tag;
    const parent = $(current).parent();
    if (parent.length > 0) {
      const siblings = parent.children(tag);
      if (siblings.length > 1) {
        const index = siblings.index(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(selector);
    current = $(current).parent().get(0) || null;
  }
  return parts.join(" > ");
}

/**
 * Scrape a landing page using HTTP + Cheerio (no browser needed).
 * Extracts content, brand colors, favicon, FULL HTML and element selectors.
 * 
 * Replaces the Playwright-based scraper for deployability on free-tier hosts
 * (Render, Railway, Fly.io) — runs in ~150MB RAM instead of ~800MB.
 * 
 * Trade-off: JS-rendered SPAs (pure CSR React/Next.js) won't be fully scraped.
 * Static/SSR/SSG sites work perfectly.
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  console.log(`[SCRAPER] Fetching page: ${url}`);
  const startTime = Date.now();

  try {
    // Fetch the raw HTML via HTTP
    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      maxRedirects: 5,
      // Accept all status codes to handle soft errors
      validateStatus: (status) => status < 500,
    });

    const fetchTime = Date.now() - startTime;
    console.log(`[SCRAPER]    Page fetched in ${fetchTime}ms — ${(response.data.length / 1024).toFixed(0)}KB`);

    const $ = cheerio.load(response.data);
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // === Title ===
    const title = $("title").text().trim() || "";

    // === H1 — find the MAIN hero headline ===
    const h1Parts: string[] = [];
    let headlineSelector = "";
    let bestH1: DomElement | null = null;
    let bestH1Index = Infinity;

    $("h1").each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) {
        h1Parts.push(text);
        // Prefer the first h1 in DOM order (likely the hero)
        if (i < bestH1Index) {
          bestH1Index = i;
          bestH1 = el;
        }
      }
    });

    if (bestH1) {
      headlineSelector = getSelector($, bestH1);
    }
    const h1 = h1Parts.join(" | ");

    // === H2 — first subheadline(s) ===
    const h2Parts: string[] = [];
    let subheadlineSelector = "";

    $("h2").each((i, el) => {
      if (i < 3) {
        const text = $(el).text().trim();
        if (text.length > 0) {
          h2Parts.push(text);
          if (!subheadlineSelector) {
            subheadlineSelector = getSelector($, el);
          }
        }
      }
    });

    // If no h2, try p tag near the h1
    if (!subheadlineSelector && bestH1) {
      const parent = $(bestH1).parent();
      const nextP = parent.find("p").first();
      if (nextP.length > 0 && nextP.text().trim().length > 10) {
        subheadlineSelector = getSelector($, nextP.get(0)!);
        if (!h2Parts.length) {
          h2Parts.push(nextP.text().trim());
        }
      }
    }

    const h2 = h2Parts.join(" | ");

    // === Paragraphs ===
    let paragraphs = "";
    const contentSelectors = ["main", "article", "section", "[role='main']"];
    for (const sel of contentSelectors) {
      const container = $(sel);
      if (container.length > 0) {
        container.find("p").each((_, el) => {
          paragraphs += $(el).text().trim() + " ";
        });
      }
    }
    if (!paragraphs.trim()) {
      $("p").each((_, el) => {
        paragraphs += $(el).text().trim() + " ";
      });
    }
    paragraphs = paragraphs.substring(0, 2000);

    // === Buttons / CTAs ===
    const btnParts: string[] = [];
    const ctaSelectors: string[] = [];

    const ctaCandidates = $(
      'a[class*="btn"], a[class*="cta"], a[class*="button"], a[class*="Button"], ' +
      'a[href*="signup"], a[href*="trial"], a[href*="get-started"], a[href*="demo"], ' +
      'button[class*="primary"], button[class*="cta"], button[class*="btn"]'
    );

    ctaCandidates.each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0 && text.length < 100) {
        btnParts.push(text);
        ctaSelectors.push(getSelector($, el as DomElement));
      }
    });

    // Also grab standalone buttons
    $("button").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0 && text.length < 100 && !btnParts.includes(text)) {
        btnParts.push(text);
        if (ctaSelectors.length < 3) {
          ctaSelectors.push(getSelector($, el as DomElement));
        }
      }
    });

    const buttons = [...new Set(btnParts)].join(" | ");

    // === Value Props — find feature/benefit sections ===
    const valuePropSelectors: string[] = [];
    const featureContainers = $(
      '[class*="feature"], [class*="benefit"], [class*="value"], ' +
      '[class*="card"], [class*="advantage"], [class*="service"]'
    );

    const seenTexts = new Set<string>();
    featureContainers.each((_, container) => {
      const heading = $(container).find("h3, h4, h2, strong, b").first();
      if (heading.length > 0) {
        const text = heading.text().trim();
        if (text.length > 3 && text.length < 150 && !seenTexts.has(text) && valuePropSelectors.length < 6) {
          seenTexts.add(text);
          valuePropSelectors.push(getSelector($, heading.get(0)!));
        }
      }
    });

    // Fallback: try list items in the hero area
    if (valuePropSelectors.length === 0) {
      const heroArea = $("header, [class*='hero'], section:first-of-type, main");
      if (heroArea.length > 0) {
        heroArea.find("li").each((_, li) => {
          const text = $(li).text().trim();
          if (text.length > 5 && text.length < 150 && valuePropSelectors.length < 6) {
            valuePropSelectors.push(getSelector($, li));
          }
        });
      }
    }

    // === Meta description ===
    const metaDesc = $('meta[name="description"]').attr("content") || "";

    // === Brand Colors (from inline styles and meta tags) ===
    let primaryColor = "";
    let bgColor = "";
    let textColor = "";

    // 1. Try meta theme-color
    const themeColor = $('meta[name="theme-color"]').attr("content");
    if (themeColor) primaryColor = themeColor;

    // 2. Try to extract from inline styles on CTA-like elements
    if (!primaryColor) {
      const ctaEl = $('a[class*="btn-primary"], a[class*="cta"], button[class*="primary"]').first();
      if (ctaEl.length > 0) {
        const style = ctaEl.attr("style") || "";
        const bgMatch = style.match(/background(?:-color)?:\s*([^;]+)/);
        if (bgMatch) primaryColor = bgMatch[1].trim();
      }
    }

    // 3. Try to extract from CSS variables or inline style tags
    if (!primaryColor) {
      $("style").each((_, styleEl) => {
        const cssText = $(styleEl).text();
        const primaryMatch = cssText.match(/--(?:primary|brand|accent)[^:]*:\s*([^;]+)/);
        if (primaryMatch && !primaryColor) {
          primaryColor = primaryMatch[1].trim();
        }
      });
    }

    // 4. Body background and text from inline styles
    const bodyStyle = $("body").attr("style") || "";
    const bodyBgMatch = bodyStyle.match(/background(?:-color)?:\s*([^;]+)/);
    const bodyTextMatch = bodyStyle.match(/(?:^|;)\s*color:\s*([^;]+)/);
    if (bodyBgMatch) bgColor = bodyBgMatch[1].trim();
    if (bodyTextMatch) textColor = bodyTextMatch[1].trim();

    const brandColors = {
      primary: primaryColor || "#6366f1",
      background: bgColor || "#ffffff",
      text: textColor || "#000000",
    };

    // === Favicon ===
    let faviconUrl = "";
    const faviconEl = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').first();
    if (faviconEl.length > 0) {
      const href = faviconEl.attr("href") || "";
      if (href.startsWith("http")) {
        faviconUrl = href;
      } else if (href.startsWith("/")) {
        faviconUrl = `${baseUrl}${href}`;
      } else if (href) {
        faviconUrl = `${baseUrl}/${href}`;
      }
    }
    if (!faviconUrl) {
      faviconUrl = `${baseUrl}/favicon.ico`;
    }

    // === Full HTML — inline external stylesheets for self-contained preview ===
    let fullHTML = response.data as string;

    console.log(`[SCRAPER]    Inlining external stylesheets...`);
    try {
      const styleSheets: string[] = [];
      $('link[rel="stylesheet"]').each((_, link) => {
        let href = $(link).attr("href") || "";
        if (href && !href.startsWith("http")) {
          href = href.startsWith("/") ? `${baseUrl}${href}` : `${baseUrl}/${href}`;
        }
        if (href) styleSheets.push(href);
      });

      let inlinedCSS = "";
      for (const sheetUrl of styleSheets.slice(0, 10)) {
        try {
          const cssResponse = await axios.get(sheetUrl, {
            timeout: 5000,
            headers: { "Accept": "text/css,*/*" },
            validateStatus: (s) => s < 400,
          });
          if (typeof cssResponse.data === "string") {
            inlinedCSS += `\n/* Inlined from: ${sheetUrl} */\n${cssResponse.data}\n`;
          }
        } catch {
          // Skip failed stylesheets
        }
      }

      // Inject all CSS as inline <style> block
      if (inlinedCSS) {
        fullHTML = fullHTML.replace("</head>", `<style>\n${inlinedCSS}\n</style>\n</head>`);
      }

      console.log(`[SCRAPER]    Inlined ${styleSheets.length} stylesheets (${(inlinedCSS.length / 1024).toFixed(0)}KB CSS)`);
    } catch (cssError: any) {
      console.warn(`[SCRAPER]    CSS inlining failed: ${cssError.message}`);
    }

    // Fix relative URLs in the HTML
    fullHTML = fullHTML.replace(/(src|href|action)=["']\//g, `$1="${baseUrl}/`);

    // Add <base> tag to resolve any remaining relative URLs
    if (!fullHTML.includes("<base")) {
      fullHTML = fullHTML.replace("<head>", `<head>\n<base href="${baseUrl}/" />`);
    }

    console.log(`[SCRAPER]    Full HTML: ${(fullHTML.length / 1024).toFixed(0)}KB`);

    const elementSelectors: ElementSelectors = {
      headline: headlineSelector,
      subheadline: subheadlineSelector,
      ctaButtons: ctaSelectors.slice(0, 3),
      valueProps: valuePropSelectors.slice(0, 6),
    };

    const elapsed = Date.now() - startTime;
    console.log(`[SCRAPER] Scrape complete in ${elapsed}ms`);
    console.log(`[SCRAPER]    Title: "${title.substring(0, 80)}"`);
    console.log(`[SCRAPER]    H1: "${h1.substring(0, 80) || "(empty)"}"`);
    console.log(`[SCRAPER]    Brand Colors:`);
    console.log(`[SCRAPER]       Primary: ${brandColors.primary}`);
    console.log(`[SCRAPER]       Background: ${brandColors.background}`);
    console.log(`[SCRAPER]       Text: ${brandColors.text}`);
    console.log(`[SCRAPER]    Favicon: ${faviconUrl.substring(0, 60)}`);
    console.log(`[SCRAPER]    Element Selectors:`);
    console.log(`[SCRAPER]       Headline: ${elementSelectors.headline || "(not found)"}`);
    console.log(`[SCRAPER]       Subheadline: ${elementSelectors.subheadline || "(not found)"}`);
    console.log(`[SCRAPER]       CTA buttons: ${elementSelectors.ctaButtons.length} found`);
    console.log(`[SCRAPER]       Value props: ${elementSelectors.valueProps.length} found`);

    const rawText = [
      `Title: ${title}`,
      `H1: ${h1}`,
      `H2: ${h2}`,
      `Paragraphs: ${paragraphs}`,
      `Buttons/CTAs: ${buttons}`,
      `Meta Description: ${metaDesc}`,
    ].join("\n\n");

    return {
      title,
      h1,
      h2,
      paragraphs,
      buttons,
      metaDesc,
      rawText,
      screenshotBase64: "", // No screenshot in HTTP-only mode
      brandColors,
      faviconUrl,
      fullHTML,
      elementSelectors,
      baseUrl,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const elapsed = Date.now() - startTime;
    console.error(`[SCRAPER] FAILED after ${elapsed}ms: ${message}`);
    throw new Error("Could not load the landing page. Make sure it is publicly accessible.");
  }
}
