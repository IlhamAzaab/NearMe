import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminOnboardingStep1() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [form, setForm] = useState({
    fullName: "",
    nicNumber: "",
    dateOfBirth: "",
    phone: "",
    homeAddress: "",
  });
  const [files, setFiles] = useState({
    profilePhoto: null,
    nicFront: null,
    nicBack: null,
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState({});
  const [error, setError] = useState(null);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileChange = (fieldKey, e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError(`${fieldKey} must be less than 5MB`);
        return;
      }
      // Validate file type
      if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
        setError(`${fieldKey} must be JPG or PNG`);
        return;
      }
      setFiles((prev) => ({ ...prev, [fieldKey]: file }));
      setError(null);
    }
  };

  const uploadToCloudinary = async (file, imageType) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("imageType", imageType);

      const response = await fetch(
        "http://localhost:5000/restaurant-onboarding/upload-image",
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

    // Check if all required text fields are filled
    if (
      !form.fullName ||
      !form.nicNumber ||
      !form.dateOfBirth ||
      !form.phone ||
      !form.homeAddress
    ) {
      setError("All personal information fields are required");
      return;
    }

    // Check if all images are selected
    if (!files.profilePhoto || !files.nicFront || !files.nicBack) {
      setError("Please upload all required images");
      return;
    }

    setLoading(true);

    try {
      // Upload images to Cloudinary
      const uploadPromises = [
        (async () => {
          setUploading((prev) => ({ ...prev, profilePhoto: true }));
          const url = await uploadToCloudinary(
            files.profilePhoto,
            "profile_photo"
          );
          setUploading((prev) => ({ ...prev, profilePhoto: false }));
          return url;
        })(),
        (async () => {
          setUploading((prev) => ({ ...prev, nicFront: true }));
          const url = await uploadToCloudinary(files.nicFront, "nic_front");
          setUploading((prev) => ({ ...prev, nicFront: false }));
          return url;
        })(),
        (async () => {
          setUploading((prev) => ({ ...prev, nicBack: true }));
          const url = await uploadToCloudinary(files.nicBack, "nic_back");
          setUploading((prev) => ({ ...prev, nicBack: false }));
          return url;
        })(),
      ];

      const [profilePhotoUrl, nicFrontUrl, nicBackUrl] = await Promise.all(
        uploadPromises
      );

      // Submit to backend with URLs
      const res = await fetch(
        "http://localhost:5000/restaurant-onboarding/step-1",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...form,
            profilePhotoUrl,
            nicFrontUrl,
            nicBackUrl,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to save step 1");
        return;
      }
      navigate("/admin/restaurant/onboarding/step-2");
    } catch (err) {
      console.error("Step1 submit error", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const allFilesUploaded =
    files.profilePhoto && files.nicFront && files.nicBack;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">
          Step 1: Personal & KYC
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Provide your personal details and upload KYC documents.
        </p>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Personal Information Section */}
          <div className="border-b pb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              Personal Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                className="border rounded-lg p-3"
                placeholder="Full Name"
                value={form.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
              />
              <input
                className="border rounded-lg p-3"
                placeholder="NIC Number"
                value={form.nicNumber}
                onChange={(e) => updateField("nicNumber", e.target.value)}
              />
              <input
                type="date"
                className="border rounded-lg p-3"
                placeholder="Date of Birth"
                value={form.dateOfBirth}
                onChange={(e) => updateField("dateOfBirth", e.target.value)}
              />
              <input
                className="border rounded-lg p-3"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
              />
              <input
                className="border rounded-lg p-3 md:col-span-2"
                placeholder="Home Address"
                value={form.homeAddress}
                onChange={(e) => updateField("homeAddress", e.target.value)}
              />
            </div>
          </div>

          {/* Document Upload Section */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              KYC Documents
            </h2>
            <div className="space-y-4">
              {/* Profile Photo */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Photo *
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={(e) => handleFileChange("profilePhoto", e)}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {files.profilePhoto && (
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
                    {files.profilePhoto.name}
                    {uploading.profilePhoto && " (Uploading...)"}
                  </div>
                )}
              </div>

              {/* NIC Front */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  NIC Front Side *
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={(e) => handleFileChange("nicFront", e)}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {files.nicFront && (
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
                    {files.nicFront.name}
                    {uploading.nicFront && " (Uploading...)"}
                  </div>
                )}
              </div>

              {/* NIC Back */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  NIC Back Side *
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={(e) => handleFileChange("nicBack", e)}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {files.nicBack && (
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
                    {files.nicBack.name}
                    {uploading.nicBack && " (Uploading...)"}
                  </div>
                )}
              </div>
            </div>
          </div>

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
              <li>Clear, readable images</li>
              <li>Maximum file size: 5MB per image</li>
              <li>Supported formats: JPG, PNG</li>
              <li>All details must be visible</li>
              <li>Good lighting, no glare</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="submit"
              className="px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              disabled={loading || !allFilesUploaded}
            >
              {loading ? "Saving..." : "Save & Continue"}
            </button>
          </div>

          {!allFilesUploaded && (
            <p className="text-center text-sm text-gray-500">
              Please upload all 3 required images to continue
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
