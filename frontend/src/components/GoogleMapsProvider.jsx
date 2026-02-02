/**
 * Google Maps Provider Component
 * Wraps the application with Google Maps JavaScript API loader
 */
import React from "react";
import { useJsApiLoader } from "@react-google-maps/api";

// Libraries to load with Google Maps - consistent across all pages
const libraries = ["places", "geometry", "maps"];

// Get API key from environment
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export function GoogleMapsProvider({ children }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  });

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center p-6">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Map Loading Error
          </h2>
          <p className="text-gray-600">
            Failed to load Google Maps. Please check your internet connection.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading maps...</p>
        </div>
      </div>
    );
  }

  return children;
}

export default GoogleMapsProvider;
