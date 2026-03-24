import React, { useState, useRef, useCallback } from "react";
import { Camera, Upload, X, Check, Loader2 } from "lucide-react";
import { API_URL } from "../config";

/**
 * DeliveryProofUpload
 *
 * Allows drivers to capture/upload a delivery proof photo.
 * Photo is uploaded to Cloudinary and the URL is saved to delivery record.
 *
 * Props:
 * - deliveryId: string - the delivery ID to attach the proof to
 * - existingProofUrl: string|null - existing proof photo URL
 * - onUploaded: (url: string) => void - callback when photo is uploaded
 */
export default function DeliveryProofUpload({
  deliveryId,
  existingProofUrl = null,
  onUploaded,
}) {
  const [proofUrl, setProofUrl] = useState(existingProofUrl);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [error, setError] = useState(null);
  const cameraInputRef = useRef(null);

  const handleFileSelected = useCallback(async (file) => {
    if (!file) return;

    // Validate type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }

    setError(null);

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewSrc(e.target.result);
      setShowPreview(true);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!previewSrc) return;

    setUploading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");

      // Convert data URI to blob
      const response = await fetch(previewSrc);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("file", blob, `delivery_proof_${deliveryId}.jpg`);

      const res = await fetch(
        `${API_URL}/driver/deliveries/${deliveryId}/proof`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (res.ok) {
        const data = await res.json();
        setProofUrl(data.url);
        setShowPreview(false);
        setPreviewSrc(null);
        onUploaded?.(data.url);
      } else {
        const data = await res.json();
        setError(data.message || "Upload failed");
      }
    } catch (e) {
      console.error("Upload error:", e);
      setError("Failed to upload. Check your connection.");
    } finally {
      setUploading(false);
    }
  }, [previewSrc, deliveryId, onUploaded]);

  const handleRemove = useCallback(() => {
    setProofUrl(null);
    setPreviewSrc(null);
    setShowPreview(false);
  }, []);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">
            Delivery Proof
          </span>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            Optional
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Already uploaded proof */}
        {proofUrl && !showPreview && (
          <div className="relative">
            <img
              src={proofUrl}
              alt="Delivery proof"
              className="w-full h-48 object-cover rounded-lg"
            />
            <div className="absolute top-2 right-2 flex gap-2">
              <button
                onClick={handleRemove}
                className="bg-red-500 text-white p-1.5 rounded-full shadow-lg active:scale-95 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
              <Check className="w-3 h-3" />
              Uploaded
            </div>
          </div>
        )}

        {/* Preview before upload */}
        {showPreview && previewSrc && (
          <div className="relative">
            <img
              src={previewSrc}
              alt="Preview"
              className="w-full h-48 object-cover rounded-lg"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white py-2.5 rounded-lg font-semibold text-sm active:scale-95 transition-transform disabled:opacity-60"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload Photo
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowPreview(false);
                  setPreviewSrc(null);
                }}
                disabled={uploading}
                className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-semibold text-sm active:scale-95 transition-transform disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Capture / Upload buttons */}
        {!proofUrl && !showPreview && (
          <div className="flex gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full flex flex-col items-center gap-2 py-4 border-2 border-dashed border-green-300 rounded-xl bg-green-50/50 text-green-600 active:scale-95 transition-transform"
            >
              <Camera className="w-6 h-6" />
              <span className="text-xs font-semibold">Take Photo</span>
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
            <X className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files[0])}
      />
    </div>
  );
}
