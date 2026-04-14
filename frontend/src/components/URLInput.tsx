import React, { useState } from "react";

interface URLInputProps {
  pageUrl: string;
  setPageUrl: (url: string) => void;
}

const URLInput: React.FC<URLInputProps> = ({ pageUrl, setPageUrl }) => {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const validateUrl = (value: string) => {
    if (!value.trim()) {
      setIsValid(null);
      return;
    }
    try {
      new URL(value);
      setIsValid(true);
    } catch {
      setIsValid(false);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    validateUrl(pageUrl);
  };

  return (
    <div className="url-input-container">
      <label className="input-label" htmlFor="page-url-input">
        Landing Page URL
      </label>

      <div
        className={`url-input-wrapper ${
          isFocused ? "url-input-wrapper--focused" : ""
        } ${isValid === true ? "url-input-wrapper--valid" : ""} ${
          isValid === false ? "url-input-wrapper--invalid" : ""
        }`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="url-icon"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>

        <input
          id="page-url-input"
          type="url"
          className="url-input"
          placeholder="https://example.com/landing-page"
          value={pageUrl}
          onChange={(e) => {
            setPageUrl(e.target.value);
            if (isValid !== null) validateUrl(e.target.value);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
        />

        {isValid === true && (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            className="validation-icon"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}

        {isValid === false && (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2.5"
            className="validation-icon"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
      </div>

      {isValid === false && (
        <p className="url-error">Please enter a valid URL</p>
      )}
    </div>
  );
};

export default URLInput;
