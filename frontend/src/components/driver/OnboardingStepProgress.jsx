import React from "react";

const DEFAULT_LABELS = ["Personal", "Vehicle", "Documents", "Bank", "Contract"];

export default function OnboardingStepProgress({
  currentStep,
  totalSteps = 5,
  labels = DEFAULT_LABELS,
}) {
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-sm font-medium text-green-600">
          {Math.round((currentStep / totalSteps) * 100)}% Complete
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-linear-to-r from-green-500 to-green-600 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        ></div>
      </div>

      <div className="flex justify-between mt-3">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNumber = i + 1;
          const isDone = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <div key={stepNumber} className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                  isDone
                    ? "bg-green-500 text-white"
                    : isCurrent
                      ? "bg-green-600 text-white ring-4 ring-green-200"
                      : "bg-gray-300 text-gray-600"
                }`}
              >
                {isDone ? (
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  stepNumber
                )}
              </div>
              <span className="text-xs mt-1 text-gray-600 hidden sm:block">
                {labels[i] || `Step ${stepNumber}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
