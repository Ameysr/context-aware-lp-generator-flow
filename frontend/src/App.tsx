import { usePersonalize } from "./hooks/usePersonalize";
import AdInput from "./components/AdInput";
import URLInput from "./components/URLInput";
import StatusStepper from "./components/StatusStepper";
import ResultPreview from "./components/ResultPreview";
import "./index.css";

function App() {
  const {
    adInput,
    setAdInput,
    pageUrl,
    setPageUrl,
    appState,
    result,
    error,
    currentStep,
    stepStatuses,
    handleSubmit,
    handleReset,
  } = usePersonalize();

  return (
    <div className="app">
      {/* Background effects */}
      <div className="bg-gradient" />
      <div className="bg-noise" />

      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <h1 className="logo-text">AdSync</h1>
        </div>
        <p className="logo-subtitle">
          AI-Powered Landing Page Personalization
        </p>
      </header>

      {/* Main content */}
      <main className="app-main">
        {/* Idle state — Input form */}
        {appState === "idle" && (
          <div className="form-container fade-in">
            <div className="form-card">
              <div className="form-card-header">
                <h2>Create Personalized Copy</h2>
                <p>
                  Upload your ad creative and landing page URL. Our AI will
                  generate message-matched copy in seconds.
                </p>
              </div>

              <div className="form-body">
                <AdInput adInput={adInput} setAdInput={setAdInput} />
                <URLInput pageUrl={pageUrl} setPageUrl={setPageUrl} />

                {error && (
                  <div className="error-banner">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  className="btn btn--primary btn--full"
                  onClick={handleSubmit}
                  disabled={appState !== "idle"}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Personalize Now
                </button>

                <div className="demo-divider">
                  <span className="demo-divider-line" />
                  <span className="demo-divider-text">or try a demo</span>
                  <span className="demo-divider-line" />
                </div>

                <button
                  className="btn btn--demo btn--full"
                  onClick={() => {
                    setAdInput({ adText: "Track issues 10x faster than Jira.\nLinear is built for high-performance teams.\nFree for teams under 250. Try Linear today —\nno credit card required." });
                    setPageUrl("https://linear.app");
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Load Demo — Linear vs Jira Ad
                </button>
              </div>

              <div className="form-footer">
                <div className="powered-by">
                  <span className="powered-label">Powered by</span>
                  <span className="llm-tag">Groq</span>
                  <span className="llm-tag">Gemini Vision</span>
                  <span className="llm-tag">DeepSeek</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading state — Stepper */}
        {appState === "loading" && (
          <div className="loading-container fade-in">
            <div className="form-card">
              <div className="form-card-header">
                <h2>Processing Your Request</h2>
                <p>Our AI pipeline is analyzing and generating personalized copy...</p>
              </div>

              <div className="form-body">
                <StatusStepper
                  stepStatuses={stepStatuses}
                  currentStep={currentStep}
                />
              </div>
            </div>
          </div>
        )}

        {/* Result state — Side by side */}
        {appState === "result" && result && (
          <div className="result-wrapper fade-in">
            <ResultPreview result={result} onReset={handleReset} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>Built with LangChain · Groq · Gemini · Playwright</p>
      </footer>
    </div>
  );
}

export default App;
