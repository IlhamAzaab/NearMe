import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config";

// Step Progress Component with animation
const StepProgress = ({ currentStep, totalSteps = 5 }) => {
  const steps = [
    { num: 1, label: "Personal" },
    { num: 2, label: "Vehicle" },
    { num: 3, label: "Documents" },
    { num: 4, label: "Bank" },
    { num: 5, label: "Contract" },
  ];

  return (
    <div className="w-full mb-8">
      {/* Step segments */}
      <div className="flex gap-2 mb-3">
        {steps.map((step) => (
          <div key={step.num} className="flex-1 relative">
            <div
              className={`h-2 rounded-full overflow-hidden ${
                step.num === currentStep
                  ? "bg-gray-200"
                  : step.num < currentStep
                  ? "bg-[#1db95b]"
                  : "bg-gray-200"
              }`}
            >
              {step.num === currentStep && (
                <div
                  className="h-full bg-[#1db95b] rounded-full"
                  style={{
                    animation: "progressFill 2s ease-in-out infinite",
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Step labels */}
      <div className="flex justify-between">
        {steps.map((step) => (
          <div
            key={step.num}
            className={`text-xs font-medium ${
              step.num === currentStep
                ? "text-[#1db95b]"
                : step.num < currentStep
                ? "text-[#1db95b]"
                : "text-gray-400"
            }`}
          >
            {step.label}
          </div>
        ))}
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes progressFill {
          0% { width: 0%; opacity: 0.6; }
          50% { width: 100%; opacity: 1; }
          100% { width: 0%; opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default function OnboardingStep3() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [documents, setDocuments] = useState({
    nic_front: null,
    nic_back: null,
    license_front: null,
    license_back: null,
    insurance: null,
    revenue_license: null,
  });

  const documentLabels = {
    nic_front: { label: "NIC Front Side", icon: "badge" },
    nic_back: { label: "NIC Back Side", icon: "badge" },
    license_front: { label: "Driving License Front", icon: "id_card" },
    license_back: { label: "Driving License Back", icon: "id_card" },
    insurance: { label: "Insurance Certificate", icon: "verified_user" },
    revenue_license: { label: "Revenue License", icon: "receipt_long" },
  };

  const handleFileChange = (docType, e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError(`${documentLabels[docType].label} must be less than 5MB`);
        return;
      }
      // Validate file type
      if (
        !["image/jpeg", "image/jpg", "image/png", "application/pdf"].includes(
          file.type
        )
      ) {
        setError(`${documentLabels[docType].label} must be JPG, PNG, or PDF`);
        return;
      }
      setDocuments({ ...documents, [docType]: file });
      setError(null);
    }
  };

  const uploadToCloudinary = async (file, docType) => {
    const token = localStorage.getItem("token");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", docType);

      const response = await fetch(
        `${API_URL}/onboarding/upload-document`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const missingDocs = Object.keys(documents).filter(
        (key) => !documents[key]
      );
      if (missingDocs.length > 0) {
        setError("Please upload all required documents");
        setLoading(false);
        return;
      }

      const uploadPromises = Object.keys(documents).map(async (docType) => {
        if (documents[docType]) {
          const url = await uploadToCloudinary(documents[docType], docType);
          return { documentType: docType, documentUrl: url };
        }
      });

      const uploadedDocs = await Promise.all(uploadPromises);

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/onboarding/step-3`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documents: uploadedDocs }),
      });

      const data = await res.json();

      if (res.ok) {
        navigate("/driver/onboarding/step-4");
      } else {
        setError(data.message || "Failed to save documents");
      }
    } catch (e) {
      setError("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate("/driver/onboarding/step-2");
  };

  const allDocsUploaded = Object.values(documents).every((doc) => doc !== null);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start relative font-display">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1db95b] via-[#34d399] via-40% to-[#f0fdf4]"></div>
      
      {/* Subtle pattern overlay */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}
      ></div>

      {/* Main content */}
      <div className="relative w-full max-w-[540px] px-4 py-8 z-10">
        {/* White card */}
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-8">
          {/* Step Progress */}
          <StepProgress currentStep={3} />

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 bg-[#dcfce7] rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1db95b] text-2xl">upload_file</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Upload Documents</h1>
              <p className="text-gray-500 text-sm">Step 3 of 5</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Document upload cards */}
            {Object.keys(documentLabels).map((docType) => (
              <div
                key={docType}
                className={`border-2 border-dashed rounded-xl p-4 transition-all ${
                  documents[docType]
                    ? "border-[#1db95b] bg-[#f0fdf4]"
                    : "border-gray-200 hover:border-[#1db95b]/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    documents[docType] ? "bg-[#1db95b]" : "bg-gray-100"
                  }`}>
                    <span className={`material-symbols-outlined text-xl ${
                      documents[docType] ? "text-white" : "text-[#1db95b]"
                    }`}>
                      {documents[docType] ? "check" : documentLabels[docType].icon}
                    </span>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700">
                      {documentLabels[docType].label} *
                    </label>
                    {documents[docType] && (
                      <p className="text-xs text-[#1db95b] truncate">{documents[docType].name}</p>
                    )}
                  </div>
                  <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${
                    documents[docType]
                      ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      : "bg-[#1db95b] text-white hover:bg-[#18a34a]"
                  }`}>
                    {documents[docType] ? "Change" : "Upload"}
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,application/pdf"
                      onChange={(e) => handleFileChange(docType, e)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ))}

            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-red-500 text-lg">error</span>
                <span>{error}</span>
              </div>
            )}

            {/* Requirements note */}
            <div className="p-4 bg-[#dcfce7] border border-[#86efac] rounded-xl">
              <p className="text-sm font-semibold text-[#166534] mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">info</span>
                Document Requirements
              </p>
              <ul className="text-sm text-[#166534] space-y-1 ml-6 list-disc">
                <li>Clear, readable images or PDFs</li>
                <li>Maximum file size: 5MB per document</li>
                <li>Supported formats: JPG, PNG, PDF</li>
                <li>All details must be visible</li>
              </ul>
            </div>

            {/* Progress indicator */}
            {!allDocsUploaded && (
              <p className="text-center text-sm text-gray-500">
                {Object.values(documents).filter(d => d !== null).length} of {Object.keys(documentLabels).length} documents uploaded
              </p>
            )}

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 h-14 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">arrow_back</span>
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={loading || !allDocsUploaded}
                className="flex-1 h-14 bg-[#1db95b] text-white font-bold rounded-xl hover:bg-[#18a34a] active:scale-[0.98] transition-all shadow-lg shadow-[#1db95b]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}