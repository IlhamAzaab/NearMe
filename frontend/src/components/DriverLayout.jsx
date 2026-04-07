import React from "react";
import DriverBottomNav from "./DriverBottomNav";

export default function DriverLayout({
  children,
  noPadding = false,
  animateReady = true,
  loading = false,
}) {
  const shouldAnimate = animateReady === true && loading !== true;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Page Content */}
      <main>
        <div
          className={`${shouldAnimate ? "driver-page-enter animate-fadeIn" : ""} ${noPadding ? "" : ""}`}
        >
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <DriverBottomNav />

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out forwards;
        }

        @keyframes driverSectionIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        .driver-page-enter [data-driver-stagger] > * {
          opacity: 0;
          animation: driverSectionIn 0.45s ease-out forwards;
        }

        .driver-page-enter [data-driver-stagger] > *:nth-child(1) { animation-delay: 0.03s; }
        .driver-page-enter [data-driver-stagger] > *:nth-child(2) { animation-delay: 0.08s; }
        .driver-page-enter [data-driver-stagger] > *:nth-child(3) { animation-delay: 0.13s; }
        .driver-page-enter [data-driver-stagger] > *:nth-child(4) { animation-delay: 0.18s; }
        .driver-page-enter [data-driver-stagger] > *:nth-child(5) { animation-delay: 0.23s; }
        .driver-page-enter [data-driver-stagger] > *:nth-child(6) { animation-delay: 0.28s; }
        .driver-page-enter [data-driver-stagger] > *:nth-child(7) { animation-delay: 0.33s; }
        .driver-page-enter [data-driver-stagger] > *:nth-child(8) { animation-delay: 0.38s; }

        @media (prefers-reduced-motion: reduce) {
          .driver-page-enter,
          .driver-page-enter [data-driver-stagger] > * {
            animation: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
