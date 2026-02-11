import React from "react";

/**
 * Fade-animated skeleton components for manager pages.
 * Uses CSS opacity fade animation instead of zoom/pulse.
 */

const fadeClass = "animate-manager-skeleton-fade bg-gray-200 rounded";

// Inject keyframes once
const SkeletonStyles = () => (
  <style>{`
    @keyframes managerSkeletonFade {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
    .animate-manager-skeleton-fade {
      animation: managerSkeletonFade 1.8s ease-in-out infinite;
    }
  `}</style>
);

export function ManagerSkeletonBox({ className = "" }) {
  return <div className={`${fadeClass} ${className}`} />;
}

export function ManagerSkeletonHeader() {
  return (
    <>
      <SkeletonStyles />
      <div className="sticky top-0 z-40 bg-white border-b border-[#dbe6e3]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`${fadeClass} w-9 h-9 rounded-lg`} />
          </div>
          <div className={`${fadeClass} h-5 w-32`} />
          <div className={`${fadeClass} w-9 h-9 rounded-lg`} />
        </div>
      </div>
    </>
  );
}

export function ManagerSkeletonHero() {
  return <div className={`${fadeClass} rounded-xl p-6 h-40`} />;
}

export function ManagerSkeletonMetrics({ count = 2 }) {
  return (
    <div className="flex gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex-1 bg-white rounded-xl border border-[#dbe6e3] p-4"
        >
          <div className={`${fadeClass} h-3 w-16 mb-2`} />
          <div className={`${fadeClass} h-6 w-24`} />
        </div>
      ))}
    </div>
  );
}

export function ManagerSkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-[#dbe6e3] p-4">
      <div className="flex items-center gap-4">
        <div className={`${fadeClass} w-12 h-12 rounded-full`} />
        <div className="flex-1 space-y-2">
          <div className={`${fadeClass} h-4 w-3/4`} />
          <div className={`${fadeClass} h-3 w-1/2`} />
          <div className={`${fadeClass} h-3 w-1/3`} />
        </div>
        <div className="text-right space-y-2">
          <div className={`${fadeClass} h-5 w-16 ml-auto`} />
          <div className={`${fadeClass} h-3 w-12 ml-auto`} />
        </div>
      </div>
    </div>
  );
}

export function ManagerSkeletonTabs() {
  return (
    <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
      <div className={`${fadeClass} flex-1 h-10 rounded-md`} />
      <div className={`${fadeClass} flex-1 h-10 rounded-md`} />
    </div>
  );
}

export function ManagerSkeletonSearch() {
  return <div className={`${fadeClass} h-11 rounded-xl`} />;
}

export function ManagerSkeletonList({ count = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ManagerSkeletonCard key={i} />
      ))}
    </div>
  );
}

export function ManagerSkeletonForm() {
  return (
    <div className="bg-white rounded-xl border border-[#dbe6e3] p-6 space-y-4">
      <div className={`${fadeClass} h-5 w-40 mb-2`} />
      <div className={`${fadeClass} h-11 rounded-lg`} />
      <div className={`${fadeClass} h-11 rounded-lg`} />
      <div className={`${fadeClass} h-11 rounded-lg w-1/2`} />
    </div>
  );
}

/**
 * Full-page skeleton for manager pages.
 * type: "deposits" | "list" | "payments" | "form" | "earnings" | "reports"
 */
export function ManagerPageSkeleton({ type = "list" }) {
  return (
    <div
      className="min-h-screen bg-[#f6f8f8] flex flex-col"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <SkeletonStyles />
      <ManagerSkeletonHeader />

      <div className="flex flex-1">
        {/* Desktop sidebar skeleton */}
        <aside className="hidden lg:block w-56 flex-shrink-0 bg-white border-r border-[#dbe6e3] p-3 space-y-2">
          <div className={`${fadeClass} h-10 rounded-lg mb-4`} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`${fadeClass} h-9 rounded-lg`} />
          ))}
        </aside>

        {/* Content skeleton */}
        <main className="flex-1 p-4 space-y-4">
          {type === "deposits" && (
            <>
              <ManagerSkeletonHero />
              <ManagerSkeletonMetrics count={2} />
              <ManagerSkeletonTabs />
              <ManagerSkeletonList count={3} />
            </>
          )}

          {type === "payments" && (
            <>
              <ManagerSkeletonMetrics count={2} />
              <ManagerSkeletonSearch />
              <ManagerSkeletonList count={4} />
            </>
          )}

          {type === "form" && (
            <>
              <div className={`${fadeClass} h-7 w-48 mb-2`} />
              <div className={`${fadeClass} h-4 w-72 mb-4`} />
              <ManagerSkeletonForm />
            </>
          )}

          {type === "earnings" && (
            <>
              <ManagerSkeletonHero />
              <ManagerSkeletonMetrics count={3} />
              <div className={`${fadeClass} h-5 w-32 mt-2`} />
              <ManagerSkeletonList count={3} />
            </>
          )}

          {type === "reports" && (
            <>
              <ManagerSkeletonMetrics count={3} />
              <ManagerSkeletonHero />
              <ManagerSkeletonList count={2} />
            </>
          )}

          {type === "list" && (
            <>
              <ManagerSkeletonSearch />
              <ManagerSkeletonList count={4} />
            </>
          )}
        </main>
      </div>

      {/* Bottom nav skeleton */}
      <div className="h-16 bg-white border-t border-[#dbe6e3]" />
    </div>
  );
}

export default ManagerPageSkeleton;
