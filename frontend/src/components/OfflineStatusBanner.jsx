import { useEffect, useState } from "react";

export default function OfflineStatusBanner() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const markOnline = () => setIsOffline(false);
    const markOffline = () => setIsOffline(true);

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 shadow-md border border-amber-300">
      You are offline. Your session is preserved and data will sync when back
      online.
    </div>
  );
}
