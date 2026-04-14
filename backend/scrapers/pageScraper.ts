import { chromium } from "playwright";

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

interface EvalResult {
  title: string;
  h1: string;
  h2: string;
  paragraphs: string;
  buttons: string;
  metaDesc: string;
  brandColors: {
    primary: string;
    background: string;
    text: string;
  };
  faviconUrl: string;
  elementSelectors: ElementSelectors;
}

/**
 * Scrape a landing page using Playwright headless chromium.
 * Extracts content, brand colors, favicon, screenshot, FULL HTML and element selectors.
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  console.log(`[SCRAPER] Launching browser for: ${url}`);
  const startTime = Date.now();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    console.log(`[SCRAPER]    Browser launched in ${Date.now() - startTime}ms`);

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    console.log(`[SCRAPER]    Navigating to ${url}...`);
    try {
      await page.goto(url, { timeout: 20000, waitUntil: "domcontentloaded" });
      console.log(`[SCRAPER]    DOM loaded in ${Date.now() - startTime}ms`);
    } catch (navError: any) {
      console.warn(`[SCRAPER]    First attempt failed: ${navError.message}`);
      await page.goto(url, { timeout: 25000, waitUntil: "commit" });
    }

    // Wait for rendering
    await page.waitForTimeout(2500);
    console.log(`[SCRAPER]    Page settled. Extracting content + colors...`);

    // Take screenshot (above-the-fold)
    const screenshotBuffer = await page.screenshot({
      type: "jpeg",
      quality: 60,
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
    const screenshotBase64 = screenshotBuffer.toString("base64");
    console.log(`[SCRAPER]    Screenshot captured: ${(screenshotBase64.length * 0.75 / 1024).toFixed(0)}KB`);

    // Extract content + brand colors + element selectors in one evaluate call
    const result: EvalResult = await page.evaluate(() => {
      const title = document.title || "";

      // === HELPER: Generate a unique CSS selector for an element ===
      function getSelector(el: Element): string {
        // Try ID first
        if (el.id) return `#${el.id}`;

        // Try unique class combination
        if (el.classList.length > 0) {
          const classSelector = `${el.tagName.toLowerCase()}.${Array.from(el.classList).join(".")}`;
          if (document.querySelectorAll(classSelector).length === 1) {
            return classSelector;
          }
        }

        // Use nth-child path
        const parts: string[] = [];
        let current: Element | null = el;
        while (current && current !== document.body && current !== document.documentElement) {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            parts.unshift(`#${current.id}`);
            break;
          }
          const parentEl: Element | null = current.parentElement;
          if (parentEl) {
            const currentTag = current.tagName;
            const siblings = Array.from(parentEl.children).filter(
              (c: Element) => c.tagName === currentTag
            );
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              selector += `:nth-of-type(${index})`;
            }
          }
          parts.unshift(selector);
          current = parentEl;
        }
        return parts.join(" > ");
      }

      // === H1 — find the MAIN hero headline ===
      const h1Nodes = document.querySelectorAll("h1");
      const h1Parts: string[] = [];
      let headlineSelector = "";
      let bestH1: Element | null = null;
      let bestH1Score = -1;

      h1Nodes.forEach((el) => {
        const text = (el as HTMLElement).innerText.trim();
        if (text.length > 0) {
          h1Parts.push(text);
          // Score: prefer h1s that are above the fold and visible
          const rect = el.getBoundingClientRect();
          const score = rect.top < 600 ? 100 - rect.top : 0;
          if (score > bestH1Score) {
            bestH1Score = score;
            bestH1 = el;
          }
        }
      });

      if (bestH1) {
        headlineSelector = getSelector(bestH1);
      }
      const h1 = h1Parts.join(" | ");

      // === H2 — first subheadline near the hero ===
      const h2Nodes = document.querySelectorAll("h2");
      const h2Parts: string[] = [];
      let subheadlineSelector = "";

      h2Nodes.forEach((el, i) => {
        if (i < 3) {
          const text = (el as HTMLElement).innerText.trim();
          if (text.length > 0) {
            h2Parts.push(text);
            if (!subheadlineSelector) {
              subheadlineSelector = getSelector(el);
            }
          }
        }
      });

      // If no h2, try p tag near the h1 (many sites use <p> for subheadline)
      if (!subheadlineSelector && bestH1) {
        const parent = (bestH1 as Element).parentElement;
        if (parent) {
          const nextP = parent.querySelector("p");
          if (nextP && (nextP as HTMLElement).innerText.trim().length > 10) {
            subheadlineSelector = getSelector(nextP);
            if (!h2Parts.length) {
              h2Parts.push((nextP as HTMLElement).innerText.trim());
            }
          }
        }
      }

      const h2 = h2Parts.join(" | ");

      // === Paragraphs ===
      const contentSelectors = ["main", "article", "section", "[role='main']"];
      let paragraphs = "";
      for (const selector of contentSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          container.querySelectorAll("p").forEach((el) => {
            paragraphs += (el as HTMLElement).innerText.trim() + " ";
          });
        }
      }
      if (!paragraphs.trim()) {
        document.querySelectorAll("p").forEach((el) => {
          paragraphs += (el as HTMLElement).innerText.trim() + " ";
        });
      }
      paragraphs = paragraphs.substring(0, 2000);

      // === Buttons / CTAs ===
      const btnParts: string[] = [];
      const ctaSelectors: string[] = [];

      // Find primary CTA buttons
      const ctaCandidates = document.querySelectorAll(
        'a[class*="btn"], a[class*="cta"], a[class*="button"], a[class*="Button"], ' +
        'a[href*="signup"], a[href*="trial"], a[href*="get-started"], a[href*="demo"], ' +
        'button[class*="primary"], button[class*="cta"], button[class*="btn"]'
      );

      ctaCandidates.forEach((el) => {
        const text = (el as HTMLElement).innerText.trim();
        if (text.length > 0 && text.length < 100) {
          btnParts.push(text);
          ctaSelectors.push(getSelector(el));
        }
      });

      // Also grab standalone buttons
      document.querySelectorAll("button").forEach((el) => {
        const text = (el as HTMLElement).innerText.trim();
        if (text.length > 0 && text.length < 100 && !btnParts.includes(text)) {
          btnParts.push(text);
          if (ctaSelectors.length < 3) {
            ctaSelectors.push(getSelector(el));
          }
        }
      });

      const buttons = [...new Set(btnParts)].join(" | ");

      // === Value Props — find feature/benefit sections ===
      const valuePropSelectors: string[] = [];
      // Look for feature cards (common patterns)
      const featureContainers = document.querySelectorAll(
        '[class*="feature"], [class*="benefit"], [class*="value"], ' +
        '[class*="card"], [class*="advantage"], [class*="service"]'
      );

      const seenTexts = new Set<string>();
      featureContainers.forEach((container) => {
        // Find headings inside feature cards
        const heading = container.querySelector("h3, h4, h2, strong, b");
        if (heading) {
          const text = (heading as HTMLElement).innerText.trim();
          if (text.length > 3 && text.length < 150 && !seenTexts.has(text) && valuePropSelectors.length < 6) {
            seenTexts.add(text);
            valuePropSelectors.push(getSelector(heading));
          }
        }
      });

      // Fallback: try list items in the hero area
      if (valuePropSelectors.length === 0) {
        const heroArea = document.querySelector("header, [class*='hero'], section:first-of-type, main");
        if (heroArea) {
          heroArea.querySelectorAll("li").forEach((li) => {
            const text = (li as HTMLElement).innerText.trim();
            if (text.length > 5 && text.length < 150 && valuePropSelectors.length < 6) {
              valuePropSelectors.push(getSelector(li));
            }
          });
        }
      }

      // === Meta description ===
      const metaDescEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      const metaDesc = metaDescEl?.content || "";

      // === BRAND COLOR EXTRACTION ===
      let primaryColor = "";
      let bgColor = "";
      let textColor = "";

      // 1. Try meta theme-color
      const themeColor = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (themeColor?.content) {
        primaryColor = themeColor.content;
      }

      // 2. Try primary CTA button color
      if (!primaryColor) {
        const ctaBtn =
          document.querySelector('a[class*="btn-primary"], a[class*="cta"], button[class*="primary"]') ||
          document.querySelector("a.btn, button.btn") ||
          document.querySelector("nav a:last-child") ||
          document.querySelector("header button");
        if (ctaBtn) {
          const style = window.getComputedStyle(ctaBtn);
          const bg = style.backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            primaryColor = bg;
          }
        }
      }

      // 3. Try most common link color
      if (!primaryColor) {
        const links = document.querySelectorAll("a");
        const colorMap: Record<string, number> = {};
        links.forEach((link) => {
          const c = window.getComputedStyle(link).color;
          if (c && c !== "rgb(0, 0, 0)" && c !== "rgb(255, 255, 255)") {
            colorMap[c] = (colorMap[c] || 0) + 1;
          }
        });
        let maxCount = 0;
        for (const [c, count] of Object.entries(colorMap)) {
          if (count > maxCount) {
            maxCount = count;
            primaryColor = c;
          }
        }
      }

      // 4. Body background and text
      const bodyStyle = window.getComputedStyle(document.body);
      bgColor = bodyStyle.backgroundColor || "";
      textColor = bodyStyle.color || "";

      if (!bgColor || bgColor === "rgba(0, 0, 0, 0)") {
        const hero = document.querySelector("header, [class*='hero'], section:first-of-type");
        if (hero) {
          bgColor = window.getComputedStyle(hero).backgroundColor || "";
        }
      }

      // === FAVICON ===
      let faviconUrl = "";
      const faviconEl =
        document.querySelector('link[rel="icon"]') as HTMLLinkElement ||
        document.querySelector('link[rel="shortcut icon"]') as HTMLLinkElement ||
        document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
      if (faviconEl?.href) {
        faviconUrl = faviconEl.href;
      } else {
        try {
          faviconUrl = new URL("/favicon.ico", window.location.origin).href;
        } catch { /* ignore */ }
      }

      return {
        title, h1, h2, paragraphs, buttons, metaDesc, faviconUrl,
        brandColors: {
          primary: primaryColor || "#6366f1",
          background: bgColor || "#ffffff",
          text: textColor || "#000000",
        },
        elementSelectors: {
          headline: headlineSelector,
          subheadline: subheadlineSelector,
          ctaButtons: ctaSelectors.slice(0, 3),
          valueProps: valuePropSelectors.slice(0, 6),
        },
      };
    });

    // === CAPTURE FULL HTML ===
    console.log(`[SCRAPER]    Capturing full rendered HTML...`);
    let fullHTML = await page.content();

    // Parse the baseUrl for resolving relative URLs
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Inline external stylesheets to make the page self-contained
    console.log(`[SCRAPER]    Inlining external stylesheets...`);
    try {
      const styleSheets = await page.evaluate(() => {
        const sheets: { href: string }[] = [];
        document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
          const href = (link as HTMLLinkElement).href;
          if (href) sheets.push({ href });
        });
        return sheets;
      });

      let inlinedCSS = "";
      for (const sheet of styleSheets.slice(0, 10)) { // Limit to 10 stylesheets
        try {
          const res = await page.evaluate(async (href: string) => {
            try {
              const r = await fetch(href);
              if (r.ok) return await r.text();
              return "";
            } catch { return ""; }
          }, sheet.href);
          if (res) {
            inlinedCSS += `\n/* Inlined from: ${sheet.href} */\n${res}\n`;
          }
        } catch {
          // Skip failed stylesheets
        }
      }

      // Also grab any computed inline styles for critical elements
      const computedStyles = await page.evaluate(() => {
        let styles = "";
        // Get all style tags content
        document.querySelectorAll("style").forEach((el) => {
          styles += el.textContent + "\n";
        });
        return styles;
      });

      // Inject all CSS as inline <style> blocks and remove external links
      if (inlinedCSS || computedStyles) {
        const allCSS = `<style>\n${computedStyles}\n${inlinedCSS}\n</style>`;
        fullHTML = fullHTML.replace("</head>", `${allCSS}\n</head>`);
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

    await browser.close();

    const elapsed = Date.now() - startTime;
    console.log(`[SCRAPER] Scrape complete in ${elapsed}ms`);
    console.log(`[SCRAPER]    Title: "${result.title.substring(0, 80)}"`);
    console.log(`[SCRAPER]    H1: "${result.h1.substring(0, 80) || "(empty)"}"`);
    console.log(`[SCRAPER]    Brand Colors:`);
    console.log(`[SCRAPER]       Primary: ${result.brandColors.primary}`);
    console.log(`[SCRAPER]       Background: ${result.brandColors.background}`);
    console.log(`[SCRAPER]       Text: ${result.brandColors.text}`);
    console.log(`[SCRAPER]    Favicon: ${result.faviconUrl.substring(0, 60)}`);
    console.log(`[SCRAPER]    Element Selectors:`);
    console.log(`[SCRAPER]       Headline: ${result.elementSelectors.headline || "(not found)"}`);
    console.log(`[SCRAPER]       Subheadline: ${result.elementSelectors.subheadline || "(not found)"}`);
    console.log(`[SCRAPER]       CTA buttons: ${result.elementSelectors.ctaButtons.length} found`);
    console.log(`[SCRAPER]       Value props: ${result.elementSelectors.valueProps.length} found`);

    const rawText = [
      `Title: ${result.title}`,
      `H1: ${result.h1}`,
      `H2: ${result.h2}`,
      `Paragraphs: ${result.paragraphs}`,
      `Buttons/CTAs: ${result.buttons}`,
      `Meta Description: ${result.metaDesc}`,
    ].join("\n\n");

    return {
      ...result,
      rawText,
      screenshotBase64,
      fullHTML,
      baseUrl,
    };
  } catch (error: unknown) {
    if (browser) await browser.close();
    const message = error instanceof Error ? error.message : String(error);
    const elapsed = Date.now() - startTime;
    console.error(`[SCRAPER] FAILED after ${elapsed}ms: ${message}`);
    throw new Error("Could not load the landing page. Make sure it is publicly accessible.");
  }
}
