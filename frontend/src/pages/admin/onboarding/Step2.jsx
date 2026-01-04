import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminOnboardingStep2() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [form, setForm] = useState({
    restaurantName: "",
    registrationNumber: "",
    address: "",
    city: "",
    postalCode: "",
    latitude: "",
    longitude: "",
    openingTime: "",
    closeTime: "",
  });
  const [files, setFiles] = useState({
    logo: null,
    coverImage: null,
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState({});
  const [error, setError] = useState(null);

  const updateField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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
      !form.restaurantName ||
      !form.address ||
      !form.city ||
      !form.postalCode ||
      !form.openingTime ||
      !form.closeTime
    ) {
      setError("All required fields must be filled");
      return;
    }

    // Check if cover image is selected
    if (!files.coverImage) {
      setError("Cover image is required");
      return;
    }

    setLoading(true);

    try {
      // Upload images to Cloudinary (logo is optional)
      const uploadPromises = [];
      let logoUrl = null;

      if (files.logo) {
        uploadPromises.push(
          (async () => {
            setUploading((prev) => ({ ...prev, logo: true }));
            const url = await uploadToCloudinary(files.logo, "logo");
            setUploading((prev) => ({ ...prev, logo: false }));
            return url;
          })()
        );
      } else {
        uploadPromises.push(Promise.resolve(null));
      }

      uploadPromises.push(
        (async () => {
          setUploading((prev) => ({ ...prev, coverImage: true }));
          const url = await uploadToCloudinary(files.coverImage, "cover_image");
          setUploading((prev) => ({ ...prev, coverImage: false }));
          return url;
        })()
      );

      const [uploadedLogoUrl, coverImageUrl] = await Promise.all(
        uploadPromises
      );
      logoUrl = uploadedLogoUrl;

      // Submit to backend with URLs
      const res = await fetch(
        "http://localhost:5000/restaurant-onboarding/step-2",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...form,
            logoUrl,
            coverImageUrl,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to save step 2");
        return;
      }
      navigate("/admin/restaurant/onboarding/step-3");
    } catch (err) {
      console.error("Step2 submit error", err);
      setError("Failed to upload images. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">
          Step 2: Restaurant Details
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Provide restaurant identity and location details.
        </p>
        <form
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          onSubmit={handleSubmit}
        >
          <input
            className="border rounded-lg p-3"
            placeholder="Restaurant Name"
            value={form.restaurantName}
            onChange={(e) => updateField("restaurantName", e.target.value)}
          />
          <input
            className="border rounded-lg p-3"
            placeholder="Business Registration Number"
            value={form.registrationNumber}
            onChange={(e) => updateField("registrationNumber", e.target.value)}
          />
          <input
            className="border rounded-lg p-3 md:col-span-2"
            placeholder="Address"
            value={form.address}
            onChange={(e) => updateField("address", e.target.value)}
          />
          <input
            className="border rounded-lg p-3"
            placeholder="City"
            value={form.city}
            onChange={(e) => updateField("city", e.target.value)}
          />
          <input
            className="border rounded-lg p-3"
            placeholder="Postal Code"
            value={form.postalCode}
            onChange={(e) => updateField("postalCode", e.target.value)}
          />
          <input
            className="border rounded-lg p-3"
            placeholder="Latitude (optional)"
            value={form.latitude}
            onChange={(e) => updateField("latitude", e.target.value)}
          />
          <input
            className="border rounded-lg p-3"
            placeholder="Longitude (optional)"
            value={form.longitude}
            onChange={(e) => updateField("longitude", e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Opening Time
            </label>
            <input
              type="time"
              className="w-full border rounded-lg p-3"
              value={form.openingTime}
              onChange={(e) => updateField("openingTime", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Closing Time
            </label>
            <input
              type="time"
              className="w-full border rounded-lg p-3"
              value={form.closeTime}
              onChange={(e) => updateField("closeTime", e.target.value)}
              required
            />
          </div>

          {/* Logo Upload (Optional) */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Restaurant Logo (Optional)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                className="flex-1 border rounded-lg p-3"
                onChange={(e) => handleFileChange("logo", e)}
              />
              {files.logo && (
                <div className="text-green-600 font-semibold">✓</div>
              )}
              {uploading.logo && (
                <div className="text-blue-600 font-semibold">⟳</div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">JPG or PNG, max 5MB</p>
          </div>

          {/* Cover Image Upload (Required) */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cover Image <span className="text-red-600">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                className="flex-1 border rounded-lg p-3"
                onChange={(e) => handleFileChange("coverImage", e)}
                required
              />
              {files.coverImage && (
                <div className="text-green-600 font-semibold">✓</div>
              )}
              {uploading.coverImage && (
                <div className="text-blue-600 font-semibold">⟳</div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">JPG or PNG, max 5MB</p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="md:col-span-2 bg-red-50 border border-red-300 text-red-700 p-3 rounded-lg">
              {error}
            </div>
          )}
          <div className="md:col-span-2 flex justify-end gap-3 mt-2">
            <button
              type="button"
              className="px-5 py-3 bg-gray-200 text-gray-800 rounded-lg"
              onClick={() => navigate("/admin/restaurant/onboarding/step-1")}
            >
              Back
            </button>
            <button
              type="submit"
              className="px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              disabled={loading}
            >
              {loading ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
