import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";

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
  const [uploadedUrls, setUploadedUrls] = useState({
    nic_front: "",
    nic_back: "",
    license_front: "",
    license_back: "",
    insurance: "",
    revenue_license: "",
  });

  const userEmail = localStorage.getItem("userEmail");
  const userName =
    localStorage.getItem("userName") || userEmail?.split("@")[0] || "Driver";

  const documentLabels = {
    nic_front: "NIC Front Side",
    nic_back: "NIC Back Side",
    license_front: "Driving License Front Side",
    license_back: "Driving License Back Side",
    insurance: "Insurance Certificate",
    revenue_license: "Revenue License",
  };

  const handleFileChange = (docType, e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError(`${documentLabels[docType]} must be less than 5MB`);
        return;
      }
      // Validate file type
      if (
        !["image/jpeg", "image/jpg", "image/png", "application/pdf"].includes(
          file.type
        )
      ) {
        setError(`${documentLabels[docType]} must be JPG, PNG, or PDF`);
        return;
      }
      setDocuments({ ...documents, [docType]: file });
      setError(null);
    }
  };

  const uploadToCloudinary = async (file, docType) => {
    const token = localStorage.getItem("token");

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", docType);

      // Upload to backend endpoint which handles Cloudinary
      const response = await fetch(
        "http://localhost:5000/onboarding/upload-document",
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
      return data.url; // Returns the secure_url from Cloudinary
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
      // Check if all documents are selected
      const missingDocs = Object.keys(documents).filter(
        (key) => !documents[key]
      );
      if (missingDocs.length > 0) {
        setError("Please upload all required documents");
        setLoading(false);
        return;
      }

      // Upload all documents to Cloudinary
      const uploadPromises = Object.keys(documents).map(async (docType) => {
        if (documents[docType]) {
          const url = await uploadToCloudinary(documents[docType], docType);
          return { documentType: docType, documentUrl: url };
        }
      });

      const uploadedDocs = await Promise.all(uploadPromises);

      // Submit to backend
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:5000/onboarding/step-3", {
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

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const handleBack = () => {
    navigate("/driver/onboarding/step-2");
  };

  const allDocsUploaded = Object.values(documents).every((doc) => doc !== null);

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader
        isLoggedIn={true}
        role="driver"
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-indigo-600">
              Step 3 of 5
            </span>
            <span className="text-sm text-gray-500">Document Upload</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full"
              style={{ width: "60%" }}
            ></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Upload Documents
          </h1>
          <p className="text-gray-600 mb-6">
            Upload clear photos or scans of your documents. All documents are
            required.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {Object.keys(documentLabels).map((docType) => (
              <div
                key={docType}
                className="border border-gray-200 rounded-lg p-4"
              >
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {documentLabels[docType]} *
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  onChange={(e) => handleFileChange(docType, e)}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {documents[docType] && (
                  <div className="mt-2 flex items-center text-sm text-green-600">
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {documents[docType].name}
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-semibold mb-2">
                📌 Document Requirements:
              </p>
              <ul className="text-sm text-blue-700 space-y-1 ml-4 list-disc">
                <li>Clear, readable images or PDFs</li>
                <li>Maximum file size: 5MB per document</li>
                <li>Supported formats: JPG, PNG, PDF</li>
                <li>All details must be visible</li>
                <li>No expired documents</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !allDocsUploaded}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {loading ? "Uploading..." : "Continue to Bank Details"}
              </button>
            </div>

            {!allDocsUploaded && (
              <p className="text-center text-sm text-gray-500">
                Please upload all {Object.keys(documentLabels).length} required
                documents to continue
              </p>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
