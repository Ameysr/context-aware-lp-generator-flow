import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { PersonalizeResult } from "../hooks/usePersonalize";

interface ResultPreviewProps {
  result: PersonalizeResult;
  onReset: () => void;
}

/* ---------- Utility: parse CSS color to hex ---------- */
function cssColorToHex(color: string): string {
  if (color.startsWith("#")) return color;
  const match = color.match(/(\d+)/g);
  if (!match || match.length < 3) return "#6366f1";
  const [r, g, b] = match.map(Number);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/* ---------- SVG Gauge ---------- */
const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (animatedScore / 10) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 200);
    return () => clearTimeout(timer);
  }, [score]);

  const color = score >= 8 ? "#10b981" : score >= 6 ? "#f59e0b" : "#ef4444";
  const glowColor = score >= 8 ? "rgba(16,185,129,0.3)" : score >= 6 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";
  const label = score >= 8 ? "Excellent" : score >= 6 ? "Good" : "Needs Work";

  return (
    <div className="gauge-container">
      <svg className="gauge-svg" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle
          cx="64" cy="64" r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform="rotate(-90 64 64)"
          style={{
            transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
            filter: `drop-shadow(0 0 8px ${glowColor})`,
          }}
        />
      </svg>
      <div className="gauge-label">
        <span className="gauge-number" style={{ color }}>{score}</span>
        <span className="gauge-slash">/10</span>
      </div>
      <span className="gauge-text" style={{ color }}>{label}</span>
    </div>
  );
};

/* ---------- Change Diff Row ---------- */
const ChangeDiff: React.FC<{
  label: string;
  original: string;
  personalized: string;
  brandHex: string;
}> = ({ label, original, personalized, brandHex }) => (
  <div className="diff-row">
    <div className="diff-label">{label}</div>
    <div className="diff-values">
      <div className="diff-original">
        <span className="diff-tag diff-tag--before">Before</span>
        <span>{original || "—"}</span>
      </div>
      <div className="diff-arrow">→</div>
      <div className="diff-personalized" style={{ borderLeftColor: brandHex }}>
        <span className="diff-tag diff-tag--after" style={{ background: brandHex }}>After</span>
        <span>{personalized || "—"}</span>
      </div>
    </div>
  </div>
);

interface RefineHistoryEntry {
  instruction: string;
  copy: NonNullable<PersonalizeResult["personalizedCopy"]>;
  previewId: string;
  timestamp: Date;
}

const ResultPreview: React.FC<ResultPreviewProps> = ({ result, onReset }) => {
  const [activeTab, setActiveTab] = useState<"preview" | "changes" | "cro" | "refine">("preview");
  const [showContent, setShowContent] = useState(false);
  const [croApplying, setCroApplying] = useState(false);
  const [croApplied, setCroApplied] = useState(false);
  const [enhancedPreviewId, setEnhancedPreviewId] = useState<string | null>(null);

  // Refine state
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineHistory, setRefineHistory] = useState<RefineHistoryEntry[]>([]);
  const [currentCopy, setCurrentCopy] = useState(result.personalizedCopy);
  const [currentRefinedPreviewId, setCurrentRefinedPreviewId] = useState<string | null>(null);

  const { pageProfile, personalizedCopy: originalCopy, llmUsed, visionUsed, processingTime, screenshotBase64, brandColors, faviconUrl, previewId, originalPreviewId, croAnalysis, adProfile } = result;
  const personalizedCopy = currentCopy || originalCopy;

  // Dynamic iframe scale factor
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const [iframeScale, setIframeScale] = useState(0.44);

  const updateScale = useCallback(() => {
    if (frameWrapRef.current) {
      const containerWidth = frameWrapRef.current.offsetWidth;
      const scale = containerWidth / 1280;
      setIframeScale(Math.min(scale, 1));
    }
  }, []);

  useEffect(() => {
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (frameWrapRef.current) observer.observe(frameWrapRef.current);
    return () => observer.disconnect();
  }, [updateScale]);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const brandHex = useMemo(() => cssColorToHex(brandColors?.primary || "#6366f1"), [brandColors]);

  const brandStyle = useMemo(() => ({
    "--brand-primary": brandHex,
    "--brand-glow": `${brandHex}33`,
    "--brand-border": `${brandHex}44`,
  }) as React.CSSProperties, [brandHex]);

  // Build the preview URLs for the iframes
  // Refined preview takes priority over CRO-enhanced, which takes priority over original
  const activePreviewId = currentRefinedPreviewId || enhancedPreviewId || previewId;
  const previewUrl = activePreviewId ? `/api/preview/${activePreviewId}` : null;
  const originalPreviewUrl = originalPreviewId ? `/api/preview/${originalPreviewId}` : null;

  // The "base" previewId to re-inject against is always the original modifiedHTML
  const basePreviewId = previewId;

  // Apply CRO fixes handler
  const handleApplyCRO = async () => {
    if (!previewId || !croAnalysis || croApplying) return;
    setCroApplying(true);
    try {
      const res = await fetch("/api/apply-cro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewId, croAnalysis, brandColors }),
      });
      const data = await res.json();
      if (data.success && data.previewId) {
        setEnhancedPreviewId(data.previewId);
        setCroApplied(true);
        setActiveTab("preview");
      }
    } catch (e) {
      console.error("Failed to apply CRO fixes:", e);
    } finally {
      setCroApplying(false);
    }
  };

  // Refine handler — sends instruction to backend, updates active copy + preview
  const handleRefine = async () => {
    const trimmed = refineInstruction.trim();
    if (!trimmed || refineLoading || !personalizedCopy || !adProfile || !pageProfile || !basePreviewId) return;
    setRefineLoading(true);
    setRefineError(null);
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentCopy: personalizedCopy,
          instruction: trimmed,
          adProfile,
          pageProfile,
          previewId: basePreviewId,
          elementSelectors: result.elementSelectors || { headline: "", subheadline: "", ctaButtons: [], valueProps: [] },
          baseUrl: result.baseUrl || "",
        }),
      });
      const data = await res.json();
      if (data.success && data.refinedCopy) {
        const entry: RefineHistoryEntry = {
          instruction: trimmed,
          copy: data.refinedCopy,
          previewId: data.previewId,
          timestamp: new Date(),
        };
        setRefineHistory(prev => [entry, ...prev]);
        setCurrentCopy(data.refinedCopy);
        setCurrentRefinedPreviewId(data.previewId);
        setRefineInstruction("");
        setActiveTab("preview"); // show the live update
      } else {
        setRefineError(data.error || "Refinement failed. Please try again.");
      }
    } catch (e: any) {
      setRefineError("Network error. Please try again.");
    } finally {
      setRefineLoading(false);
    }
  };

  if (!personalizedCopy || !pageProfile) {
    return (
      <div className="result-error fade-in">
        <div className="error-icon-wrap">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h3>Something went wrong</h3>
        <p>{result.error || "No data returned."}</p>
        <button className="btn btn--primary" onClick={onReset}>Try Again</button>
      </div>
    );
  }

  const score = personalizedCopy.personalization_score;

  return (
    <div className={`result-shell ${showContent ? "result-shell--visible" : ""}`} style={brandStyle}>
      {/* ---- Top Bar ---- */}
      <div className="result-topbar">
        <div className="result-topbar-left">
          <div className="topbar-chip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Analysis Complete
          </div>
          <span className="topbar-time">{((processingTime || 0) / 1000).toFixed(1)}s</span>
        </div>
        <button className="btn btn--ghost" onClick={onReset}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '6px'}}>
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          New Analysis
        </button>
      </div>

      {/* ---- Hero: Dual Scores + Meta ---- */}
      <div className="result-hero">
        <ScoreGauge score={score} />

        {/* Message Match % — deterministic score */}
        {result.messageMatchScore && (
          <div className="message-match-card">
            <div className="mm-header">
              <span className="mm-percentage" style={{
                color: result.messageMatchScore.overall >= 70 ? '#10b981' :
                       result.messageMatchScore.overall >= 45 ? '#f59e0b' : '#ef4444'
              }}>
                {result.messageMatchScore.overall}%
              </span>
              <span className="mm-label">Message Match</span>
            </div>
            <div className="mm-bars">
              <div className="mm-bar-row">
                <span className="mm-bar-label">Headline</span>
                <div className="mm-bar-track">
                  <div className="mm-bar-fill" style={{ width: `${result.messageMatchScore.headlineMatch}%`, background: '#818cf8' }} />
                </div>
                <span className="mm-bar-value">{result.messageMatchScore.headlineMatch}%</span>
              </div>
              <div className="mm-bar-row">
                <span className="mm-bar-label">Offer/CTA</span>
                <div className="mm-bar-track">
                  <div className="mm-bar-fill" style={{ width: `${result.messageMatchScore.offerMatch}%`, background: '#a78bfa' }} />
                </div>
                <span className="mm-bar-value">{result.messageMatchScore.offerMatch}%</span>
              </div>
              <div className="mm-bar-row">
                <span className="mm-bar-label">Benefit</span>
                <div className="mm-bar-track">
                  <div className="mm-bar-fill" style={{ width: `${result.messageMatchScore.benefitMatch}%`, background: '#c4b5fd' }} />
                </div>
                <span className="mm-bar-value">{result.messageMatchScore.benefitMatch}%</span>
              </div>
            </div>
          </div>
        )}

        <div className="result-meta">
          <h2 className="result-meta-title">Personalization Score</h2>
          <p className="result-meta-desc">
            LLM self-assessment ({score}/10) + deterministic message match ({result.messageMatchScore?.overall || 0}%).
          </p>
          <div className="meta-chips">
            <div className={`meta-chip meta-chip--${llmUsed}`}>
              <span className="meta-chip-dot" />
              {llmUsed === "groq" ? "Groq Llama 3.3" : "DeepSeek"}
            </div>
            {visionUsed && (
              <div className="meta-chip meta-chip--vision">
                <span className="meta-chip-dot" />
                Gemini Vision
              </div>
            )}
          </div>
          {result.warning && <p className="result-meta-warn">{result.warning}</p>}
        </div>
      </div>

      {/* ---- Tab Switcher ---- */}
      <div className="result-tabs">
        <button
          className={`result-tab ${activeTab === "preview" ? "result-tab--active" : ""}`}
          onClick={() => setActiveTab("preview")}
          style={activeTab === "preview" ? { borderBottomColor: brandHex, color: brandHex } : {}}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Live Preview
        </button>
        <button
          className={`result-tab ${activeTab === "changes" ? "result-tab--active" : ""}`}
          onClick={() => setActiveTab("changes")}
          style={activeTab === "changes" ? { borderBottomColor: brandHex, color: brandHex } : {}}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Changes ({personalizedCopy.changes_made.length})
        </button>
        {croAnalysis && (
          <button
            className={`result-tab ${activeTab === "cro" ? "result-tab--active" : ""}`}
            onClick={() => setActiveTab("cro")}
            style={activeTab === "cro" ? { borderBottomColor: "#f59e0b", color: "#f59e0b" } : {}}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            CRO Insights ({croAnalysis.suggestions.length})
          </button>
        )}
        <button
          className={`result-tab ${activeTab === "refine" ? "result-tab--active" : ""}`}
          onClick={() => setActiveTab("refine")}
          style={activeTab === "refine" ? { borderBottomColor: "#a78bfa", color: "#a78bfa" } : {}}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Refine Copy {refineHistory.length > 0 && <span className="refine-tab-badge">{refineHistory.length}</span>}
        </button>
      </div>

      {/* ---- Preview Tab: Before/After Iframes ---- */}
      {activeTab === "preview" && (
        <div className="result-comparison">
          <div className="comparison-label-row">
            <span className="comparison-label comparison-label--before">
              {faviconUrl && <img src={faviconUrl} alt="" className="comparison-favicon" onError={(e) => (e.currentTarget.style.display = "none")} />}
              Original Page
            </span>
            <span className="comparison-label comparison-label--after" style={{ color: brandHex }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              AI Personalized
            </span>
          </div>

          <div className="comparison-panels comparison-panels--iframe">
            {/* Original — Live iframe of original page */}
            <div className="preview-panel">
              <div className="preview-browser-chrome">
                <div className="browser-dots">
                  <span className="dot dot--red" />
                  <span className="dot dot--yellow" />
                  <span className="dot dot--green" />
                </div>
                <div className="browser-address">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>{pageProfile.page_url}</span>
                </div>
              </div>
              <div className="preview-frame-wrap" ref={!previewUrl ? undefined : frameWrapRef}>
                {originalPreviewUrl ? (
                  <div
                    className="preview-iframe-scaler"
                    style={{ "--iframe-scale": iframeScale } as React.CSSProperties}
                  >
                    <iframe
                      src={originalPreviewUrl}
                      title="Original landing page"
                      className="preview-iframe"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : screenshotBase64 ? (
                  <img
                    src={`data:image/jpeg;base64,${screenshotBase64}`}
                    alt="Original landing page"
                    className="preview-screenshot"
                  />
                ) : (
                  <div className="preview-placeholder">
                    <p>Preview unavailable</p>
                  </div>
                )}
              </div>
            </div>

            {/* Personalized — Live iframe */}
            <div className="preview-panel preview-panel--personalized">
              <div className="preview-browser-chrome preview-browser-chrome--brand" style={{ borderBottomColor: `${brandHex}33` }}>
                <div className="browser-dots">
                  <span className="dot dot--red" />
                  <span className="dot dot--yellow" />
                  <span className="dot dot--green" />
                </div>
                <div className="browser-address">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={brandHex} strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>{pageProfile.page_url}</span>
                  <span className="address-badge" style={{ background: brandHex }}>Personalized</span>
                </div>
              </div>
              <div className="preview-frame-wrap" ref={frameWrapRef}>
                {previewUrl ? (
                  <div
                    className="preview-iframe-scaler"
                    style={{ "--iframe-scale": iframeScale } as React.CSSProperties}
                  >
                    <iframe
                      src={previewUrl}
                      title="Personalized landing page"
                      className="preview-iframe"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  /* Fallback: show a styled mock if no preview HTML available */
                  <div className="preview-fallback">
                    <div className="fallback-content">
                      <h3 style={{ color: brandHex }}>{personalizedCopy.new_hero_headline}</h3>
                      <p>{personalizedCopy.new_subheadline}</p>
                      <div className="fallback-props">
                        {personalizedCopy.new_value_props.map((vp: string, i: number) => (
                          <div key={i} className="fallback-prop">
                            <span style={{ color: brandHex }}>✦</span> {vp}
                          </div>
                        ))}
                      </div>
                      <button className="fallback-cta" style={{ background: brandHex }}>
                        {personalizedCopy.new_cta_text}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Changes Tab: Detailed diff view ---- */}
      {activeTab === "changes" && (
        <div className="result-changes-detail">
          <ChangeDiff
            label="Hero Headline"
            original={pageProfile.hero_headline}
            personalized={personalizedCopy.new_hero_headline}
            brandHex={brandHex}
          />
          <ChangeDiff
            label="Subheadline"
            original={pageProfile.subheadline}
            personalized={personalizedCopy.new_subheadline}
            brandHex={brandHex}
          />
          <ChangeDiff
            label="CTA Button"
            original={pageProfile.cta_text}
            personalized={personalizedCopy.new_cta_text}
            brandHex={brandHex}
          />
          <div className="diff-row">
            <div className="diff-label">Value Propositions</div>
            <div className="diff-values diff-values--vertical">
              {personalizedCopy.new_value_props.map((vp: string, i: number) => (
                <div key={i} className="diff-vp-row">
                  <div className="diff-original">
                    <span className="diff-tag diff-tag--before">Before</span>
                    <span>{pageProfile.value_props?.[i] || "—"}</span>
                  </div>
                  <div className="diff-arrow">→</div>
                  <div className="diff-personalized" style={{ borderLeftColor: brandHex }}>
                    <span className="diff-tag diff-tag--after" style={{ background: brandHex }}>After</span>
                    <span>{vp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Changes list */}
          <div className="changes-summary">
            <h4>Changes Applied</h4>
            {personalizedCopy.changes_made.map((c: string, i: number) => (
              <div key={i} className="change-row">
                <div className="change-number" style={{ background: `${brandHex}15`, color: brandHex }}>{i + 1}</div>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- CRO Tab: Conversion Rate Optimization insights ---- */}
      {activeTab === "cro" && croAnalysis && (
        <div className="cro-insights">
          <div className="cro-header">
            <div className="cro-score-badge">
              <span className="cro-score-number">{croAnalysis.overall_score}</span>
              <span className="cro-score-label">/10 CRO Score</span>
            </div>
            <p className="cro-summary">{croAnalysis.summary}</p>
            <button
              className={`cro-apply-btn ${croApplied ? "cro-apply-btn--applied" : ""}`}
              onClick={handleApplyCRO}
              disabled={croApplying || croApplied}
            >
              {croApplying ? (
                <>
                  <span className="cro-apply-spinner" /> Applying...
                </>
              ) : croApplied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  CRO Applied
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Apply CRO Fixes
                </>
              )}
            </button>
          </div>

          <div className="cro-suggestions">
            {croAnalysis.suggestions.map((s, i) => {
              const severityConfig = {
                critical: { 
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>, 
                  bg: "rgba(239, 68, 68, 0.04)", border: "rgba(239, 68, 68, 0.15)", color: "#f87171", label: "Critical" 
                },
                warning: { 
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>, 
                  bg: "rgba(245, 158, 11, 0.04)", border: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", label: "Warning" 
                },
                good: { 
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>, 
                  bg: "rgba(16, 185, 129, 0.04)", border: "rgba(16, 185, 129, 0.15)", color: "#34d399", label: "Good" 
                },
              }[s.severity];

              return (
                <div
                  key={i}
                  className="cro-card"
                  style={{ background: severityConfig.bg, borderColor: severityConfig.border }}
                >
                  <div className="cro-card-header">
                    <span className="cro-severity-icon">{severityConfig.icon}</span>
                    <span className="cro-severity-label" style={{ color: severityConfig.color }}>{severityConfig.label}</span>
                    <span className="cro-category">{s.category}</span>
                  </div>
                  <h4 className="cro-card-title">{s.title}</h4>
                  <p className="cro-card-desc">{s.description}</p>
                  <div className="cro-card-fix">
                    <span className="cro-fix-label" style={{ color: brandHex }}>
                      <svg width="12" height="12" style={{marginRight: '6px', verticalAlign: '-1px'}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                      Fix
                    </span>
                    <span>{s.fix}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Refine Tab ---- */}
      {activeTab === "refine" && (
        <div className="refine-panel">
          {/* Input area */}
          <div className="refine-input-section">
            <div className="refine-input-header">
              <h3 className="refine-title">Refine the Copy</h3>
              <p className="refine-subtitle">Give an instruction and the AI will update headline, subheadline, CTA, and value props accordingly. Repeat as many times as you like.</p>
            </div>
            <div className="refine-input-wrap">
              <textarea
                className="refine-textarea"
                placeholder='e.g. "Make the headline more urgent" or "Focus on solo developers, not teams" or "Change the CTA to be more casual"'
                value={refineInstruction}
                onChange={e => setRefineInstruction(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRefine(); }}
                rows={3}
                disabled={refineLoading}
              />
              <div className="refine-actions">
                <span className="refine-hint">Cmd+Enter to submit</span>
                <button
                  className="refine-submit-btn"
                  onClick={handleRefine}
                  disabled={refineLoading || !refineInstruction.trim()}
                >
                  {refineLoading ? (
                    <><span className="refine-spinner" /> Refining...</>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      Apply Refinement
                    </>
                  )}
                </button>
              </div>
            </div>
            {refineError && <p className="refine-error">{refineError}</p>}
          </div>

          {/* Current copy preview */}
          <div className="refine-current-section">
            <h4 className="refine-section-label">Current Copy {refineHistory.length > 0 && <span className="refine-iteration-badge">v{refineHistory.length + 1}</span>}</h4>
            <div className="refine-copy-grid">
              <div className="refine-copy-item">
                <span className="refine-copy-label">Headline</span>
                <span className="refine-copy-value">{personalizedCopy?.new_hero_headline}</span>
              </div>
              <div className="refine-copy-item">
                <span className="refine-copy-label">Subheadline</span>
                <span className="refine-copy-value">{personalizedCopy?.new_subheadline}</span>
              </div>
              <div className="refine-copy-item">
                <span className="refine-copy-label">CTA</span>
                <span className="refine-copy-value refine-copy-cta">{personalizedCopy?.new_cta_text}</span>
              </div>
              <div className="refine-copy-item">
                <span className="refine-copy-label">Value Props</span>
                <div className="refine-copy-vps">
                  {personalizedCopy?.new_value_props.map((vp, i) => (
                    <span key={i} className="refine-copy-vp">{vp}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Refinement history */}
          {refineHistory.length > 0 && (
            <div className="refine-history-section">
              <h4 className="refine-section-label">Refinement History</h4>
              <div className="refine-history-list">
                {refineHistory.map((entry, i) => (
                  <div key={i} className="refine-history-entry">
                    <div className="refine-history-header">
                      <div className="refine-history-meta">
                        <span className="refine-history-version">v{refineHistory.length - i + 1}</span>
                        <span className="refine-history-instruction">"{entry.instruction}"</span>
                      </div>
                      <span className="refine-history-time">
                        {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="refine-history-changes">
                      {entry.copy.changes_made.map((c, j) => (
                        <div key={j} className="refine-history-change">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {c}
                        </div>
                      ))}
                    </div>
                    <button
                      className="refine-restore-btn"
                      title="Restore this version"
                      onClick={() => {
                        setCurrentCopy(entry.copy);
                        setCurrentRefinedPreviewId(entry.previewId);
                        setActiveTab("preview");
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                      </svg>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultPreview;
