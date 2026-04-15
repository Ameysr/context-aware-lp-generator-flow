# AdSync Context Aware Landing Page Personalizer

An AI powered system that takes **any ad creative** (image, text, or URL) and a **target landing page URL**, then automatically generates and injects **message-matched personalized copy** into the landing page with a live before/after comparison and CRO (Conversion Rate Optimization) audit all in under 15 seconds.

---

## Key Features

> Built to solve a real problem in digital marketing: when someone clicks an ad, the landing page rarely reflects what the ad said. This disconnect kills conversions. AdSync fixes that automatically.

| Feature | What it does |
|---|---|
| **Multi modal Ad Input** | Accepts ads as an uploaded image, pasted text, or a URL handles all three input types with different AI paths (Gemini Vision for images, Groq LLM for text) |
| **Headless Browser Scraping** | Uses **Playwright** (real Chromium) to fully render the landing page including JavaScript rendered content so it works on React, Next.js, Shopify, and any other framework |
| **AI Personalization Engine** | **Groq (Llama 3.3 70B)** rewrites the landing page headline, subheadline, CTA, and 3 value props to match the ad's message, tone, urgency, and target audience |
| **Two Layer Output Validation** | All generated copy passes through (1) a deterministic rule checker (char limits, banned words, required verb formats) and (2) an LLM self scoring check must score >= 7/10 to pass |
| **Auto Retry with Feedback** | If validation fails, the system automatically retries up to 3 times, feeding the failure reason back into the LLM prompt to fix the specific issue |
| **Live HTML Injection** | The validated copy is injected directly into the original page's HTML using precise CSS selectors extracted during scraping preserving all original styling, images, and layout |
| **Side by Side Live Preview** | Both the original and personalized pages are rendered as live iframes in a before/after comparison panel users see the real page, not a screenshot |
| **CRO Audit (Conversion Scoring)** | After personalization, **Gemini Vision** visually audits the page screenshot and Groq generates actionable CRO suggestions with a score out of 10 |
| **One Click CRO Fix Injection** | Users can click "Apply CRO Fixes" to automatically inject conversion boosting elements (urgency banners, trust signals, CTA animations) directly into the page theme aware for light and dark sites |
| **Real Time Pipeline Updates** | The 6 step pipeline streams live status updates to the frontend via **Server Sent Events (SSE)** users see exactly which step is running at all times |
| **Automatic LLM Failover** | If Groq hits a rate limit or times out, the system silently switches to **DeepSeek** as a fallback zero downtime for the user |
| **Iterative Copy Refinement** | After generation, users can type plain English instructions to refine the copy unlimited times "make the headline more urgent", "change Linear to Binear everywhere", or "focus on solo devs not teams" each refinement re injects into the original HTML and shows an updated live preview instantly |
| **Global Text Find and Replace** | When the user asks to change a specific word or brand name, the AI detects the intent and applies a global DOM level find and replace across the entire page HTML including navbar, footer, and all repeated occurrences |
| **Refinement Version History** | Every refinement instruction is logged with a timestamp and a list of what changed. Users can restore any previous version of the page with one click |
| **Deterministic Message Match Scoring** | A repeatable, LLM-free percentage score (0–100%) computed via Jaccard similarity and keyword coverage across 3 layers: Headline Match (40%), Offer/CTA Match (30%), and Benefit/ValueProp Match (30%) — displayed alongside the LLM's self-assessed score |
| **Auto Offer Banner Injection** | When the ad contains discount, free trial, or urgency terms, a themed offer banner is automatically injected at the top of the personalized page during initial generation — no manual CRO step needed |
| **Fully Dockerized** | Both frontend (Nginx + Vite) and backend (Node + Playwright) are containerized with Docker Compose one command to run the entire stack | |

---

## Industry Comparison & Roadmap

After studying how production CRO platforms approach message match and dynamic landing pages, we benchmarked AdSync against industry standards to identify gaps. Below is what has been implemented, what hasn't (and why), and the production roadmap.

### Implemented

#### 1. Deterministic Message Match Scoring

| What industry does | What AdSync does |
|---|---|
| Production CRO tools quantify message match as a % (0%, 40%, 100%). Industry data shows 0% match → 76% bounce, 100% match → 28% bounce (+340% conversion lift) | AdSync computes a **deterministic message match score** (0 to 100%) using Jaccard similarity + keyword coverage across 3 layers. No LLM involved, fully explainable and repeatable |

**How it works:**

```
Message Match Score = Headline (40%) + Offer/CTA (30%) + Benefit (30%)

  Headline:  Jaccard similarity of ad headline tokens vs generated headline tokens
  Offer/CTA: % of ad offer keywords appearing in CTA + subheadline
  Benefit:   % of ad benefit keywords appearing in value props

Stopwords are filtered, text is normalized to lowercase.
Result is a concrete "Message Match: 87%" not a subjective "Score: 8/10".
```

This metric is displayed in the frontend alongside the LLM's self assessed personalization score, giving users **two complementary perspectives**: one deterministic (message match %), one semantic (LLM score).

#### 2. Auto Offer Banner Injection

| What industry does | What AdSync does |
|---|---|
| Production platforms auto inject urgency banners, countdown timers, and offer displays during page generation | AdSync detects discount/free/urgency terms in the ad profile and auto injects a themed offer banner at the top of the personalized page **during initial generation** |

**Detection patterns:**
- Discount: `50% off`, `$10 off`, `₹500 off`, `half price`
- Free offers: `free trial`, `free shipping`, `no credit card`, `free for`
- Urgency: `limited time`, `today only`, `ends soon`, `last chance`

The banner is **theme aware** and detects whether the page uses a dark or light background, adjusting gradient colors accordingly.

#### 3. Subheadline as Benefit Proof (Already Covered)

Industry standard Layer 2 (Benefit Match) ensures the specific benefit from the ad is proven on the page. AdSync's `new_subheadline` already reinforces the ad's key benefit, and the 3 value props provide supporting proof points.

### Not Implemented (Resource Constraints)

The following features are standard in production CRO platforms but are not implemented due to infrastructure and resource constraints. They are documented here to show awareness of the industry standard.

#### 1. Template System

**What industry does:** Production platforms own the page template with variables (`{ad_headline}`, `{price_range}`, `{discount_percentage}`). Pages are generated in <80ms by filling variables, no scraping needed.

**Why not implemented:** This requires a template builder UI, a variable mapping system, and a product catalog integration. AdSync instead uses a **scrape and inject approach** that works on any website without requiring template ownership, a harder engineering problem but with a broader use case.

#### 2. A/B Variant Generation

**What industry does:** Production platforms auto generate 100+ variations per ad and track which converts best over time.

**Why not implemented:** Generating multiple variants is trivial (ask the LLM for 3 headlines instead of 1), but **tracking conversion rates** requires a JavaScript snippet deployed on the live page, an analytics backend, and a statistical significance calculator. This is a product feature, not a demo feature.

#### 3. Visual/Time Frame Match (Industry Layers 3 to 5)

**What industry does:** Matches visual style (lifestyle vs minimalist), reinforces time based claims ("results in 14 days"), and mirrors ad imagery on the landing page.

**Why not implemented:** Visual match requires generative image capabilities or a curated image library. Time frame match requires parsing temporal claims and injecting timeline UI components. Both are production grade features beyond the scope of a copy personalization engine.

#### 4. Mobile First Preview

**What industry does:** 78% of ad clicks come from mobile. Industry platforms emphasize mobile first message matching.

**Why not implemented yet:** The iframe preview currently renders at desktop width (1280px). A mobile viewport toggle (375px) is a straightforward addition but was deprioritized in favor of core pipeline reliability.

#### 5. URL Parameter Pass Through & Real Time Signals

**What industry does:** Production platforms read UTM parameters and 140+ behavioral signals to personalize in real time (<80ms).

**Why not implemented:** Real time edge personalization requires a CDN level deployment (Cloudflare Workers, Vercel Edge Functions) and session tracking infrastructure. AdSync operates as an offline analysis tool, not a real time proxy.

### Production Roadmap

These features would elevate AdSync from a portfolio project to a production SaaS:

| Priority | Feature | Description | Effort |
|---|---|---|---|
| P0 | **Redis/MongoDB Store** | Move previewStore + sessionStore from in memory Map to persistent storage | 1 day |
| P1 | **Batch Processing API** | Accept 100+ ads via CSV, generate personalized pages in parallel, export as package | 2 days |
| P1 | **Mobile Preview Toggle** | Add 375px viewport button alongside desktop preview | 2 hours |
| P2 | **Multi Variant Headlines** | Generate 3 headline options per analysis, let user pick | 3 hours |
| P2 | **Template Builder** | Let users upload HTML templates with `{{headline}}` variables for <100ms generation | 1 week |
| P3 | **Conversion Analytics** | Track CTA click through rates, A/B test variants, show lift over time | 2 weeks |

---

## Table of Contents

- [How It Works System Flow](#how-it-works--system-flow)
- [Architecture Overview](#architecture-overview)
- [Key Components & Agent Design](#key-components--agent-design)
- [Handling Failure Modes](#handling-failure-modes)
  - [Random / Unexpected Changes](#1-random--unexpected-changes)
  - [Broken UI](#2-broken-ui)
  - [Hallucinations](#3-hallucinations)
  - [Inconsistent Outputs](#4-inconsistent-outputs)
- [Iterative Copy Refinement](#iterative-copy-refinement)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Run (Local)](#setup--run-local)
- [Setup & Run (Docker)](#setup--run-docker)
- [API Reference](#api-reference)
- [Improvements & Roadmap](#improvements--roadmap)

---

## How It Works System Flow

The entire pipeline is a **6 step sequential graph** orchestrated by `personalizationGraph.ts`. Steps 1 2 run in parallel; steps 3 4 form a retry loop; steps 5 6 are sequential post-processing.

```
User Input (Ad Creative + Landing Page URL)
         │
         ▼
┌────────────────────────────────────────────┐
│  PHASE 1 — Parallel Analysis               │
│                                            │
│  ┌──────────────┐   ┌───────────────────┐  │
│  │ Step 1:      │   │ Step 2:           │  │
│  │ Ad Analysis  │   │ Page Ingestion    │  │
│  │ (Gemini +    │   │ (Playwright       │  │
│  │  Groq)       │   │  Scraper + Groq)  │  │
│  └──────┬───────┘   └────────┬──────────┘  │
│         │                    │              │
│         ▼                    ▼              │
│     AdProfile           PageProfile         │
│     (structured)        + Full HTML         │
│                         + Screenshot        │
│                         + Brand Colors      │
│                         + Element Selectors │
└────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────┐
│  PHASE 2 — Generate + Validate Loop        │
│  (max 4 attempts)                          │
│                                            │
│  ┌──────────────┐   ┌───────────────────┐  │
│  │ Step 3:      │──▶│ Step 4:           │  │
│  │ Personalize  │   │ Validate          │  │
│  │ (Groq LLM)   │◀──│ (Rules + LLM     │  │
│  │              │   │  Self-Check)      │  │
│  └──────────────┘   └───────────────────┘  │
│         ▲                    │              │
│         │    retry w/        │              │
│         └── feedback ────────┘              │
│                                            │
│  Output: PersonalizedCopy (validated)       │
└────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────┐
│  PHASE 3 HTML Injection                  │  
│                                            │
│  Step 5: Inject personalized copy into     │
│  the original HTML using CSS selectors     │
│  extracted during scraping.                │
│  (Cheerio DOM manipulation)                │
│                                            │
│  Output: Modified HTML with new copy       │
└────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────┐
│  PHASE 4 CRO Analysis                      │
│                                            │
│  Step 6: Analyze the page for conversion   │
│  improvements using Gemini Vision          │
│  (screenshot) + Groq (structured output).  │
│                                            │
│  Output: 3 actionable CRO suggestions      │
│  + overall CRO score (1-10)                │
└────────────────────────────────────────────┘
         │
         ▼
   Response sent to frontend
   (SSE step-by-step + final JSON)
```

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────┐
│                     FRONTEND (Vite + React)            │
│                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ AdInput  │  │ StatusStepper│  │ ResultPreview   │ │
│  │ URLInput │  │ (6-step SSE) │  │ (Before/After   │ │
│  │          │  │              │  │  Iframe + CRO)  │ │
│  └──────────┘  └──────────────┘  └─────────────────┘ │
│         │              ▲                   ▲          │
│         ▼              │ SSE events        │ REST     │
│  ┌─────────────────────┴───────────────────┘          │
│  │           usePersonalize() hook                    │
│  └────────────────────┬──────────────────────────────┘│
│                       │ /api/personalize               │
└───────────────────────┼───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│                     BACKEND (Express + TypeScript)      │
│                                                       │
│  server.ts ─── SSE Manager ─── Preview Store          │
│       │                                               │
│       ▼                                               │
│  personalizationGraph.ts  (Pipeline Orchestrator)     │
│       │                                               │
│       ├── chains/adAnalysisChain.ts                   │
│       ├── chains/pageIngestionChain.ts                │
│       ├── chains/personalizationChain.ts              │
│       ├── chains/validationChain.ts                   │
│       ├── chains/croAnalysisChain.ts                  │
│       │                                               │
│       ├── utils/llmRouter.ts        (Groq ↔ DeepSeek)│
│       ├── utils/retryHandler.ts     (JSON parse retry)│
│       ├── utils/visionHandler.ts    (Gemini Vision)   │
│       ├── utils/htmlInjector.ts     (Cheerio inject)  │
│       ├── utils/croApplicator.ts    (CRO fix inject)  │
│       │                                               │
│       ├── scrapers/pageScraper.ts   (Playwright)      │
│       ├── validators/ruleValidator.ts                 │
│       └── schemas/*.ts              (Zod validation)  │
└───────────────────────────────────────────────────────┘
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
     Groq API      Gemini API   DeepSeek API
     (Llama 3.3)   (Vision)     (Fallback LLM)
```

---

## Key Components & Agent Design

### 1. Ad Analysis Chain (`adAnalysisChain.ts`)

Processes the ad creative through one of three paths:

| Input Type | Processing Path |
|---|---|
| **Image** | Gemini Vision → text description → Groq structured extraction |
| **URL** | Fetch HTML + OG meta tags → Groq structured extraction |
| **Text** | Direct Groq structured extraction |

**Output:** `AdProfile` — structured object with `headline`, `offer`, `tone`, `audience`, `urgency_level`, `key_benefit`, `cta_text`.

### 2. Page Ingestion Chain (`pageIngestionChain.ts`)

Uses **Playwright** headless Chromium to:
- Render the full page (including JS-heavy SPAs)
- Take a screenshot for Gemini Vision CRO analysis
- Extract brand colors via computed styles
- Find favicon URL
- Capture full HTML + CSS selector paths for headline, subheadline, CTA buttons, and value props
- Extract structured text content

The scraped text is then processed by **Groq** to produce a `PageProfile` with `hero_headline`, `subheadline`, `value_props`, `cta_text`, `current_tone`.

### 3. Personalization Chain (`personalizationChain.ts`)

Generates new copy that creates **"message match"** between the ad and the page. The LLM receives:
- The full `AdProfile` (tone, offer, urgency, audience)
- The full `PageProfile` (current copy, tone)
- Hard constraints (char limits, banned words, required action verbs)
- Optional retry feedback from previous failed validation

**Output:** `PersonalizedCopy` — `new_hero_headline`, `new_subheadline`, `new_cta_text`, `new_value_props[3]`, `personalization_score`, `changes_made[]`.

### 4. Validation Chain (`validationChain.ts`)

**Two-layer validation** ensures output quality:

| Layer | Type | What It Checks |
|---|---|---|
| **Step 1: Rule Validator** | Deterministic (no LLM) | Headline ≤ 80 chars, CTA starts with action verb, exactly 3 value props, no banned words, no empty fields |
| **Step 2: LLM Self-Check** | LLM-based scoring | Semantic alignment between ad creative and generated copy (score 1–10, threshold ≥ 7) |

If validation fails, the pipeline **retries up to 3 times**, feeding the failure reason back into the prompt as corrective guidance.

### 5. HTML Injector (`htmlInjector.ts`)

Uses **Cheerio** to surgically replace copy in the original HTML:
- Maps personalized fields to CSS selectors found during scraping
- Preserves all original styling, layout, scripts, and assets
- Rewrites relative URLs to absolute (so images/CSS still load in iframes)
- Falls back to heuristic selector matching if exact selectors fail

### 6. CRO Analysis Chain (`croAnalysisChain.ts`)

Post-injection analysis using:
1. **Gemini Vision** — visual audit of the page screenshot
2. **Groq** — generates exactly 3 actionable suggestions with severity levels (critical/warning/good)

### 7. CRO Applicator (`croApplicator.ts`)

When the user clicks "Apply CRO Fixes", this utility:
- Detects the page's theme (light vs dark) from brand colors
- Injects theme-aware elements: urgency banners, trust bars, security signals, CTA animations
- Uses Cheerio to manipulate the DOM without breaking existing functionality

### 8. LLM Router (`llmRouter.ts`)

Automatic failover system:
```
Groq (Llama-3.3-70b) --[429 / timeout]--> DeepSeek (deepseek-chat)
```
- Primary: **Groq** (fastest inference, free tier)
- Fallback: **DeepSeek** (triggered on rate limit 429 or 10s timeout)
- Transparent to the rest of the pipeline

### 9. Refine Chain (`refineChain.ts`)

Enables **unlimited iterative refinement** after generation. The user types a plain-English instruction and the AI applies it, producing a new version of the page instantly.

**What the refine chain does:**

1. Takes the **current copy** (from last generation or last refinement), the **user's instruction**, and the **original ad + page context**
2. Instructs the LLM to change **only what the instruction asks for** — everything else stays the same
3. Outputs two things:
   - `copy` — the updated structured fields (headline, subheadline, CTA, value props)
   - `text_replacements` — an array of global find-and-replace pairs for words/names that appear anywhere on the page

**Three-strategy HTML injection (most robust to least robust):**

| Strategy | Trigger | Example |
|---|---|---|
| **1. CSS Selector** | Scraper found a unique selector for the element | `#hero > h1` exactly matches one node |
| **2. Text Content Match** | Selector missing but original text is known | Finds `<h1>` containing the exact original headline text |
| **3. First Tag Fallback** | Both above fail (dynamic class names, shadow DOM) | Grabs the first `<h1>` on the page — works for 100% of sites |

**Global text replacement (DOM tree walk):**

When the user asks to change a specific word or brand name — like *"change Linear to Binear"* — the chain returns a `text_replacements` list. The server walks every text node in the entire DOM and replaces every occurrence, including in the navbar, footer, meta tags, and button labels. Safety: strings shorter than 2 characters are skipped to prevent breaking HTML.

**Session store for clean re-injection:**

The original page HTML and CSS selectors are stored server-side in a `sessionStore` keyed by `previewId`. Every refinement always re-injects from this clean original HTML — not from the previously personalized version. This prevents copy drift and double-injection artifacts across multiple refinement rounds.

**Version history and restore:**

The frontend tracks every refinement in a history log (instruction, timestamp, what changed). Users can restore any previous version with one click — the previewId for each version is preserved.

---

## Handling Failure Modes

### 1. Random / Unexpected Changes

**Problem:** The LLM might generate copy that drastically deviates from the original page's branding or introduces content not present in the ad.

**How we handle it:**

- **Banned Word Filter** (`ruleValidator.ts`): A deterministic list of hyperbolic words (`revolutionary`, `game-changing`, `best-in-class`, etc.) is stripped automatically — no LLM involved, so it's 100% reliable.
- **Constraint-Locked Prompts**: The personalization prompt enforces hard rules:
  - "DO NOT invent features or benefits not in the ad or original page"
  - "DO NOT change brand name or product name"
  - "DO NOT add pricing unless in original page"
- **HTML Injection Safety**: The injector only replaces text content at known CSS selectors — it never modifies layout, styling, scripts, or images. The worst case is that a text replacement doesn't match and the original copy is preserved.
- **Retry with Corrective Feedback**: If validation catches a random deviation, the failure reason is fed back into the next attempt's prompt as explicit correction: `"Your previous attempt was rejected for this reason: [reason]. Fix this issue."`

### 2. Broken UI

**Problem:** The injected HTML preview might render broken in the iframe (missing CSS, broken images, layout shifts).

**How we handle it:**

- **Full HTML Capture**: The scraper captures the complete document (`document.documentElement.outerHTML`) including all inline styles, linked stylesheets, and scripts.
- **Base URL Rewriting** (`htmlInjector.ts`): All relative URLs in the HTML (`href`, `src`, `srcset`, `action`, `poster`, `data-src`) are rewritten to absolute using the page's origin + base path. This ensures CSS, images, and fonts load correctly from within an iframe.
- **`<base>` Tag Injection**: A `<base href="...">` tag is injected into the `<head>` as a safety net for any URLs the regex-based rewriter misses.
- **Original Preview Endpoint**: The system stores **both** the original and modified HTML. Users see a side-by-side comparison, so if the modified version is broken, the original is always available for reference.
- **Iframe Sandbox**: Previews use `sandbox="allow-same-origin"` — scripts don't execute (preventing tracking errors), but styles render correctly.
- **CRO Applicator Theme Detection**: Injected CRO elements detect whether the page is light or dark and adapt their styling accordingly, preventing clashing colors.

### 3. Hallucinations

**Problem:** The LLM might fabricate features, benefits, pricing, or statistics that don't exist in either the ad or the original page.

**How we handle it:**

- **Two-Layer Validation Gate**:
  - **Layer 1 — Deterministic Rules** (`ruleValidator.ts`): Checks structural correctness (lengths, counts, format) without involving an LLM. This catches the most common hallucination side-effects (e.g., generating 5 value props instead of 3, or adding a novel field).
  - **Layer 2 — LLM Self-Check** (`validationChain.ts`): A separate LLM call scores how well the generated copy aligns with the *original* ad creative on a 1–10 scale. Scores below 7 trigger a retry. This catches semantic hallucinations ("The copy mentions a 50% discount but the ad only says 'special offer'").
- **Zod Schema Enforcement** (`schemas/*.ts`): Every chain output is validated against strict Zod schemas. If the LLM adds extra fields, changes types, or omits required fields, the parse fails and triggers a retry.
- **Prompt Engineering**: The prompts use explicit negative constraints ("DO NOT invent features") and provide the exact JSON shape expected, reducing the LLM's creative freedom to only the text content fields.
- **Max 4 Attempts**: The generate→validate loop runs up to 4 times (1 initial + 3 retries). If all 4 fail, the system returns the best sanitized attempt with a `warning` flag in the response, so the frontend can display a visual indicator.

### 4. Inconsistent Outputs

**Problem:** Running the same input twice might produce wildly different copy, tone, or quality.

**How we handle it:**

- **Low Temperature** (`temperature: 0.1`): Both Groq and DeepSeek are configured with near-deterministic temperature (0.1), heavily reducing randomness. The same input will produce highly similar (though not byte-identical) outputs.
- **Structured JSON Output**: Every LLM call requires raw JSON output matching a strict schema. This eliminates formatting variance (markdown fences, bullet points, prose responses) that would otherwise cause inconsistency.
- **Retry Handler JSON Extraction** (`retryHandler.ts`): The response parser handles multiple edge cases:
  - Strips markdown code fences (`\`\`\`json`)
  - Extracts JSON from surrounding prose text (regex `/{[\s\S]*}/`)
  - Retries with a corrective prompt if parsing fails
- **Schema Normalization**: Zod schemas enforce exact types (e.g., `personalization_score` must be a number, not a string "8"). Type coercion is applied before validation.
- **Deterministic Rule Layer**: The rule validator always applies the same checks regardless of which LLM or attempt produced the output. Banned words are always stripped; character limits are always enforced.

---

## Iterative Copy Refinement

After the initial AI generation, users are not locked in. The **Refine Copy** tab gives full control to iterate on the personalized page using plain-English instructions — as many times as needed.

### How It Works

```
User types instruction
        │
        ▼
Refine Chain (Groq LLM)
  ├─ Reads: current copy + instruction + original ad context + page context
  ├─ Outputs: updated copy fields  ──────────────────────────────────────▶  HTML Injection
  └─ Outputs: text_replacements [ {find, replace}, ... ]  ─────────────▶  Global DOM Walk
        │
        ▼
New preview stored (fresh re-injection from original HTML)
        │
        ▼
Live preview updates instantly in the browser
```

### Types of Instructions

| Instruction Type | Example | How it works |
|---|---|---|
| **Tone / urgency change** | "Make the headline more urgent" | Updates `new_hero_headline` field |
| **Audience targeting** | "Focus on solo devs, not enterprise teams" | Rewrites subheadline + value props |
| **CTA change** | "Change CTA to something more casual" | Updates `new_cta_text` |
| **Brand / name swap** | "Change Linear to Binear everywhere" | Global DOM text replacement |
| **Emphasis shift** | "Highlight speed over collaboration" | Rewrites all 4 copy fields |
| **Mixed** | "Change the headline to X and replace Linear with Binear in the nav" | Both copy update + text_replacements |

### Three-Strategy HTML Injection

The injector uses a waterfall of strategies to find elements even on dynamic SPAs:

1. **CSS Selector** — uses the exact path captured during scraping (`#hero > h1`)
2. **Text Match** — finds elements containing the original text content
3. **First Tag Fallback** — grabs the first `<h1>` on the page (works on 100% of sites)

### Session Store Architecture

The original page HTML is stored server-side in a `sessionStore` keyed by `previewId`. Every refinement **re-injects from this clean original** — not from the previously personalized version. This prevents copy drift across multiple rounds.

### Version History & Restore

Every refinement is logged in the frontend with:
- The exact instruction typed
- Timestamp
- List of changes the AI made
- The `previewId` for that specific version

Users can **restore any previous version** instantly with one click.

---

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, Vite 8, TypeScript | SPA with live SSE streaming |
| **Backend** | Express 5, TypeScript, ts-node | REST API + SSE server |
| **Scraping** | Playwright (Chromium) | Headless browser for full-page rendering |
| **DOM Manipulation** | Cheerio | Server-side HTML injection |
| **LLM (Primary)** | Groq — Llama 3.3 70B | Fast structured text generation |
| **LLM (Fallback)** | DeepSeek Chat | Automatic failover on rate limits |
| **Vision** | Google Gemini (generative-ai) | Ad image analysis + CRO visual audit |
| **Validation** | Zod | Runtime schema enforcement |
| **Orchestration** | Custom graph runner | Sequential + parallel step execution |
| **Containerization** | Docker + Docker Compose | Production deployment |

---

## Project Structure

```
context-aware-lp-generator-flow/
├── docker-compose.yml              # Orchestrates both containers
│
├── backend/
│   ├── Dockerfile                  # Node 20 + Playwright Chromium
│   ├── .dockerignore
│   ├── .env                        # API keys (GROQ, DEEPSEEK, GEMINI)
│   ├── server.ts                   # Express server, SSE, preview store
│   ├── package.json
│   ├── tsconfig.json
│   │
│   ├── graph/
│   │   └── personalizationGraph.ts # Pipeline orchestrator (6-step graph)
│   │
│   ├── chains/
│   │   ├── adAnalysisChain.ts      # Step 1: Ad creative → AdProfile
│   │   ├── pageIngestionChain.ts   # Step 2: URL → PageProfile + HTML
│   │   ├── personalizationChain.ts # Step 3: Generate personalized copy
│   │   ├── validationChain.ts      # Step 4: Rule checks + LLM scoring
│   │   └── croAnalysisChain.ts     # Step 6: CRO audit
│   │
│   ├── schemas/
│   │   ├── adProfileSchema.ts      # Zod: AdProfile type
│   │   ├── pageProfileSchema.ts    # Zod: PageProfile type
│   │   ├── personalizedCopySchema.ts # Zod: PersonalizedCopy type
│   │   └── croAnalysisSchema.ts    # Zod: CROAnalysis type
│   │
│   ├── scrapers/
│   │   └── pageScraper.ts          # Playwright headless scraper
│   │
│   ├── utils/
│   │   ├── llmRouter.ts            # Auto-failover: Groq → DeepSeek
│   │   ├── retryHandler.ts         # JSON parse retry with correction
│   │   ├── visionHandler.ts        # Gemini Vision wrapper
│   │   ├── htmlInjector.ts         # Cheerio-based HTML copy injector
│   │   └── croApplicator.ts        # Theme-aware CRO element injector
│   │
│   └── validators/
│       └── ruleValidator.ts        # Deterministic copy rules
│
└── frontend/
    ├── Dockerfile                  # Multi-stage: Node build → Nginx serve
    ├── .dockerignore
    ├── nginx.conf                  # SPA routing + API proxy + SSE support
    ├── vite.config.ts
    ├── package.json
    │
    └── src/
        ├── App.tsx                 # Main app (3 states: idle/loading/result)
        ├── index.css               # Full design system (premium dark mode)
        ├── main.tsx                # React entry point
        │
        ├── api/
        │   └── personalize.ts      # API client + SSE stream connector
        │
        ├── hooks/
        │   └── usePersonalize.ts   # State management hook
        │
        └── components/
            ├── AdInput.tsx         # Ad creative input (image/text/URL)
            ├── URLInput.tsx        # Landing page URL input with validation
            ├── StatusStepper.tsx   # 6-step pipeline progress stepper
            └── ResultPreview.tsx   # Before/after iframes + CRO insights
```

---

## Setup & Run (Local)

### Prerequisites
- Node.js 20+
- npm or yarn

### 1. Clone & install

```bash
git clone <repo-url>
cd context-aware-lp-generator-flow

# Backend
cd backend
npm install
npx playwright install chromium
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### 2. Configure API keys

Create `backend/.env`:
```env
GROQ_API_KEY=your_groq_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
GEMINI_API_KEY=your_gemini_api_key
PORT=3001
```

### 3. Run

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Setup & Run (Docker)

### Prerequisites
- Docker & Docker Compose

### 1. Configure API keys

Ensure `backend/.env` has your API keys (see above).

### 2. Build & run

```bash
docker-compose up --build
```

### 3. Access

Open **http://localhost** in your browser.

The frontend (Nginx) on port 80 proxies all `/api/*` requests to the backend container on port 3001.

### Stopping

```bash
docker-compose down
```

---

## API Reference

### `GET /api/health`
Health check — returns API key availability status.

### `GET /api/personalize/stream?sessionId=<id>`
SSE endpoint — streams pipeline step updates in real-time.

**Events:**
```json
{ "type": "step", "step": 1, "label": "Analyzing Ad Creative", "status": "active" }
{ "type": "result", "data": { ... } }
{ "type": "error", "error": "...", "stage": "..." }
```

### `POST /api/personalize`
Main personalization endpoint.

**Body:**
```json
{
  "pageUrl": "https://example.com",
  "adImageBase64": "base64...",    // optional
  "mimeType": "image/png",         // required if image provided
  "adText": "ad copy text...",      // optional
  "adUrl": "https://ad-url.com",   // optional
  "sessionId": "uuid"              // optional, for SSE updates
}
```

### `GET /api/preview/:id`
Serves stored HTML previews (original or modified) for iframe rendering.

### `POST /api/apply-cro`
Applies CRO fixes to a stored preview.

**Body:**
```json
{
  "previewId": "abc123",
  "croAnalysis": { ... },
  "brandColors": { "primary": "#6366f1", "background": "#fff", "text": "#000" }
}
```

---

## Improvements & Roadmap

### Current Limitations

| Issue | Impact | Suggested Fix |
|---|---|---|
| **Client-rendered SPAs** | React/Next.js apps may not fully hydrate before scraping | Add configurable wait time or `networkidle` detection in scraper |
| **Rate Limits** | Groq free tier has aggressive rate limits under load | Add request queuing or upgrade to paid tier |
| **CRO Applicator Scope** | Only 4 categories (urgency, social proof, trust, CTA) | Expand to form friction, above-the-fold, mobile optimization |
| **No Persistent Storage** | Previews expire after 30 min (in-memory Map) | Add Redis or SQLite for preview persistence |
| **No Authentication** | Open API, only rate-limited | Add API key auth or OAuth for production |

### Recommended Improvements

1. **A/B Test Mode**: Generate 2-3 copy variants per run and let users pick the best one.
2. **Competitor Analysis**: Scrape competitor landing pages and benchmark CRO scores.
3. **Copy History**: Store past personalizations with timestamps for iterative refinement.
4. **Webhook Notifications**: Notify via Slack/email when a new personalization completes.
5. **Custom Brand Guidelines**: Let users upload brand voice rules to constrain the LLM further.
6. **Multi-page Support**: Extend beyond single landing pages to entire funnels.
7. **Analytics Integration**: Track conversion lift when personalized copy is deployed.

---

## License

MIT
