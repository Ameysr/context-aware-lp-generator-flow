import React, { useState, useRef, useEffect, type DragEvent, type ChangeEvent } from "react";
import type { AdInput as AdInputType } from "../hooks/usePersonalize";

interface AdInputProps {
  adInput: AdInputType;
  setAdInput: (input: AdInputType) => void;
}

const AdInput: React.FC<AdInputProps> = ({ adInput, setAdInput }) => {
  const [activeTab, setActiveTab] = useState<"image" | "text">("text");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");
  const [inputType, setInputType] = useState<"text" | "url" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync internal state when parent fills adInput externally (e.g., demo button)
  useEffect(() => {
    if (adInput.adText && adInput.adText !== textValue) {
      setTextValue(adInput.adText);
      setInputType("text");
      setActiveTab("text");
    } else if (adInput.adUrl && adInput.adUrl !== textValue) {
      setTextValue(adInput.adUrl);
      setInputType("url");
      setActiveTab("text");
    }
  }, [adInput.adText, adInput.adUrl]);

  const handleFile = (file: File) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      alert("Image too large. Please use an image under 4MB.");
      return;
    }

    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + " KB");

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Set preview
      setPreviewUrl(result);

      // Strip the data URI prefix → raw base64
      const base64 = result.split(",")[1];
      setAdInput({
        imageBase64: base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleTextBlur = () => {
    const trimmed = textValue.trim();
    if (!trimmed) {
      setInputType(null);
      setAdInput({});
      return;
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      setInputType("url");
      setAdInput({ adUrl: trimmed });
    } else {
      setInputType("text");
      setAdInput({ adText: trimmed });
    }
  };

  const clearImage = () => {
    setPreviewUrl(null);
    setFileName(null);
    setFileSize(null);
    setAdInput({});
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="ad-input-container">
      <label className="input-label">Ad Creative</label>

      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === "image" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("image")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Upload Image
        </button>
        <button
          className={`tab-btn ${activeTab === "text" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("text")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Paste Text or URL
        </button>
      </div>

      {activeTab === "image" && (
        <div className="image-upload-area">
          <div
            className={`drop-zone ${isDragging ? "drop-zone--dragging" : ""} ${
              previewUrl ? "drop-zone--has-image" : ""
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            {previewUrl ? (
              <div className="preview-container">
                <img
                  src={previewUrl}
                  alt="Ad preview"
                  className="image-preview"
                />
                <button
                  className="clear-image-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearImage();
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="drop-zone-content">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="upload-icon"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="drop-zone-text">
                  Drag & drop your ad image here
                </p>
                <p className="drop-zone-subtext">
                  or click to browse • JPEG, PNG, WebP (max 4MB)
                </p>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden-file-input"
          />

          {fileName && (
            <div className="file-info">
              <span className="file-name">{fileName}</span>
              <span className="file-size">{fileSize}</span>
            </div>
          )}

          {adInput.imageBase64 && (
            <div className="vision-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Will be analyzed by Gemini Vision
            </div>
          )}
        </div>
      )}

      {activeTab === "text" && (
        <div className="text-input-area">
          <textarea
            className="ad-textarea"
            rows={4}
            placeholder="Paste your ad copy here, or paste the URL of the ad"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={handleTextBlur}
          />

          {inputType && (
            <div
              className={`detection-badge ${
                inputType === "url"
                  ? "detection-badge--url"
                  : "detection-badge--text"
              }`}
            >
              {inputType === "url" ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  URL detected
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Text detected
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdInput;
