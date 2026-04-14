import * as cheerio from "cheerio";
import type { CROAnalysis } from "../schemas/croAnalysisSchema";

interface BrandColors {
  primary: string;
  background: string;
  text: string;
}

/**
 * Apply CRO improvement suggestions directly into the HTML.
 * Uses the website's own brand colors to keep visual consistency.
 * No emojis — clean, professional injections.
 */
export function applyCROFixes(
  html: string,
  croAnalysis: CROAnalysis,
  brandColors?: BrandColors
): string {
  console.log("[CRO APPLY] Starting CRO fixes...");
  const $ = cheerio.load(html);
  let fixesApplied = 0;

  // Use brand colors for theming, fallback to neutral
  const primary = brandColors?.primary || "#6366f1";
  const bgColor = brandColors?.background || "#ffffff";
  const textColor = brandColors?.text || "#111827";

  // Detect if the page is dark-themed
  const isDark = isColorDark(bgColor);
  const subtleBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)";
  const subtleBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const mutedText = isDark ? "#94a3b8" : "#6b7280";

  for (const suggestion of croAnalysis.suggestions) {
    try {
      switch (suggestion.category) {
        case "Urgency": {
          if ($("#adsync-urgency-banner").length > 0) break;
          const banner = `
            <div id="adsync-urgency-banner" style="
              width: 100%; padding: 10px 20px; text-align: center;
              background: ${primary};
              color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 14px; font-weight: 600; letter-spacing: 0.2px;
              position: relative; z-index: 9998;
            ">
              Limited Time Offer — Special pricing available for a short time
              <span style="margin-left:12px;padding:3px 12px;background:rgba(0,0,0,0.15);border-radius:12px;font-size:12px;font-weight:500;">
                Ends Soon
              </span>
            </div>`;
          $("body").prepend(banner);
          console.log("[CRO APPLY]    Applied: Urgency banner");
          fixesApplied++;
          break;
        }

        case "Social Proof": {
          if ($("#adsync-trust-bar").length > 0) break;
          const trustBar = `
            <div id="adsync-trust-bar" style="
              display: flex; align-items: center; justify-content: center; gap: 24px;
              padding: 14px 20px; margin: 16px auto; max-width: 620px;
              background: ${subtleBg}; border: 1px solid ${subtleBorder};
              border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">
              <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:${mutedText};">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="${primary}" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>
                <span><strong style="color:${primary};">4.9/5</strong> Rating</span>
              </div>
              <div style="width:1px;height:18px;background:${subtleBorder};"></div>
              <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:${mutedText};">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${primary}" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span><strong style="color:${isDark ? '#e2e8f0' : '#1f2937'};">50,000+</strong> Users</span>
              </div>
              <div style="width:1px;height:18px;background:${subtleBorder};"></div>
              <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:${mutedText};">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${primary}" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span><strong style="color:${isDark ? '#e2e8f0' : '#1f2937'};">Trusted</strong> by industry leaders</span>
              </div>
            </div>`;
          const hero = $("h1").first();
          if (hero.length > 0) {
            hero.closest("section, div, header").first().after(trustBar);
          } else {
            $("body").children().first().after(trustBar);
          }
          console.log("[CRO APPLY]    Applied: Social proof trust bar");
          fixesApplied++;
          break;
        }

        case "Trust Signals": {
          if ($("#adsync-trust-signals").length > 0) break;
          const trustSignals = `
            <div id="adsync-trust-signals" style="
              display: flex; align-items: center; justify-content: center; gap: 20px;
              padding: 10px 0; margin-top: 8px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 12px; color: ${mutedText};
            ">
              <div style="display:flex;align-items:center;gap:4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${primary}" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>SSL Secured</span>
              </div>
              <span style="color:${subtleBorder};">|</span>
              <div style="display:flex;align-items:center;gap:4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${primary}" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span>No Credit Card Required</span>
              </div>
              <span style="color:${subtleBorder};">|</span>
              <div style="display:flex;align-items:center;gap:4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${primary}" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Cancel Anytime</span>
              </div>
            </div>`;
          const cta = $("a[class*='btn'], a[class*='cta'], button[class*='primary'], a[class*='primary']").first();
          if (cta.length > 0) {
            cta.closest("div").after(trustSignals);
          } else {
            $("h1").first().closest("div").append(trustSignals);
          }
          console.log("[CRO APPLY]    Applied: Trust signals near CTA");
          fixesApplied++;
          break;
        }

        case "CTA Design": {
          if ($("#adsync-cta-enhance").length > 0) break;
          const ctaStyle = `
            <style id="adsync-cta-enhance">
              a[class*='btn']:first-of-type,
              a[class*='cta']:first-of-type,
              button[class*='primary']:first-of-type,
              a[class*='primary']:first-of-type {
                animation: adsync-pulse 2.5s ease-in-out infinite !important;
                box-shadow: 0 4px 20px ${primary}66 !important;
              }
              @keyframes adsync-pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
              }
            </style>`;
          $("head").append(ctaStyle);
          console.log("[CRO APPLY]    Applied: CTA pulse enhancement");
          fixesApplied++;
          break;
        }

        case "Hero Clarity":
        case "Visual Hierarchy":
        case "Message Match": {
          console.log(`[CRO APPLY]    Skip: ${suggestion.category} (handled by personalization)`);
          break;
        }

        default: {
          console.log(`[CRO APPLY]    Skip: ${suggestion.category} (no auto-fix)`);
          break;
        }
      }
    } catch (e: any) {
      console.warn(`[CRO APPLY]    Failed: ${suggestion.category} — ${e.message}`);
    }
  }

  // Update the AdSync badge
  const existingBadge = $("#adsync-personalized-badge");
  if (existingBadge.length > 0) {
    existingBadge.text("Personalized + CRO Enhanced by AdSync");
    existingBadge.css("background", `linear-gradient(135deg, ${primary}, #a78bfa)`);
  }

  console.log(`[CRO APPLY] Done — ${fixesApplied} CRO fixes applied`);
  return $.html();
}

/** Check if a hex color is dark */
function isColorDark(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return false;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
