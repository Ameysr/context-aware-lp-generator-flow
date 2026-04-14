import React from "react";
import type { StepStatuses } from "../hooks/usePersonalize";

interface StatusStepperProps {
  stepStatuses: StepStatuses;
  currentStep: number;
}

const STEPS = [
  { id: 1, label: "Analyzing Ad Creative" },
  { id: 2, label: "Scanning Landing Page" },
  { id: 3, label: "Generating Personalized Copy" },
  { id: 4, label: "Validating Output" },
  { id: 5, label: "Injecting Personalized Copy" },
  { id: 6, label: "Analyzing CRO Opportunities" },
];

const StatusStepper: React.FC<StatusStepperProps> = ({
  stepStatuses,
  currentStep,
}) => {
  return (
    <div className="stepper-container">
      <div className="stepper-track">
        {STEPS.map((step, index) => {
          const status = stepStatuses[step.id] || "pending";

          return (
            <React.Fragment key={step.id}>
              <div className={`stepper-step stepper-step--${status}`}>
                <div className="stepper-icon">
                  {status === "pending" && (
                    <span className="stepper-number">{step.id}</span>
                  )}
                  {status === "active" && (
                    <div className="stepper-spinner" />
                  )}
                  {status === "done" && (
                    <svg
                      className="stepper-check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {status === "error" && (
                    <svg
                      className="stepper-x"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </div>
                <span className="stepper-label">{step.label}</span>
              </div>

              {index < STEPS.length - 1 && (
                <div
                  className={`stepper-connector ${
                    stepStatuses[step.id] === "done"
                      ? "stepper-connector--done"
                      : ""
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {currentStep > 0 && (
        <div className="stepper-current-label">
          <div className="stepper-pulse" />
          Currently:{" "}
          {STEPS.find((s) => s.id === currentStep)?.label || "Processing"}...
        </div>
      )}
    </div>
  );
};

export default StatusStepper;
