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

export function ManagerSkeletonHero({ className = "h-40" }) {
  return <div className={`${fadeClass} rounded-xl ${className}`} />;
}

export function ManagerSkeletonMetrics({ count = 2, className = "" }) {
  return (
    <div
      className={`grid gap-3 ${count >= 3 ? "grid-cols-3" : "grid-cols-2"} ${className}`}
    >
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

export function ManagerSkeletonCard({ compact = false }) {
  return (
    <div className="bg-white rounded-xl border border-[#dbe6e3] p-4">
      <div className="flex items-center gap-3">
        <div
          className={`${fadeClass} ${compact ? "w-10 h-10" : "w-12 h-12"} rounded-full`}
        />
        <div className="flex-1 space-y-2">
          <div className={`${fadeClass} h-4 ${compact ? "w-2/3" : "w-3/4"}`} />
          <div className={`${fadeClass} h-3 w-1/2`} />
          {!compact && <div className={`${fadeClass} h-3 w-1/3`} />}
        </div>
        <div className="text-right space-y-2">
          <div
            className={`${fadeClass} h-5 ${compact ? "w-14" : "w-16"} ml-auto`}
          />
          <div className={`${fadeClass} h-3 w-12 ml-auto`} />
        </div>
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className={`${fadeClass} h-9`} />
          <div className={`${fadeClass} h-9`} />
        </div>
      )}
    </div>
  );
}

export function ManagerSkeletonTabs({ count = 2 }) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${fadeClass} flex-1 h-10 rounded-md`} />
      ))}
    </div>
  );
}

export function ManagerSkeletonSearch({ withButton = false }) {
  if (!withButton) return <div className={`${fadeClass} h-11 rounded-xl`} />;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className={`${fadeClass} col-span-2 h-11 rounded-xl`} />
      <div className={`${fadeClass} h-11 rounded-xl`} />
    </div>
  );
}

export function ManagerSkeletonList({ count = 3, compact = false }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ManagerSkeletonCard key={i} compact={compact} />
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
      <div className={`${fadeClass} h-40 rounded-xl`} />
      <div className="flex gap-3">
        <div className={`${fadeClass} h-11 rounded-lg flex-1`} />
        <div className={`${fadeClass} h-11 rounded-lg flex-1`} />
      </div>
    </div>
  );
}

export function ManagerSkeletonTable({ rows = 6 }) {
  return (
    <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
      <div className="p-4 border-b border-[#e7efec] flex items-center gap-3">
        <div className={`${fadeClass} h-8 w-40`} />
        <div className={`${fadeClass} h-8 w-24 ml-auto`} />
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 gap-3 pb-3 border-b border-[#eef4f1]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={`table-head-${i}`}
                className={`${fadeClass} h-3 w-20`}
              />
            ))}
          </div>
          <div className="divide-y divide-[#eef4f1]">
            {Array.from({ length: rows }).map((_, row) => (
              <div
                key={`table-row-${row}`}
                className="grid grid-cols-7 gap-3 py-4"
              >
                <div className="space-y-2">
                  <div className={`${fadeClass} h-3 w-24`} />
                  <div className={`${fadeClass} h-3 w-16`} />
                </div>
                <div className={`${fadeClass} h-3 w-20`} />
                <div className={`${fadeClass} h-3 w-20`} />
                <div className={`${fadeClass} h-6 w-16 rounded-full`} />
                <div className={`${fadeClass} h-3 w-20`} />
                <div className={`${fadeClass} h-3 w-20`} />
                <div className="flex gap-2">
                  <div className={`${fadeClass} h-8 w-12 rounded-lg`} />
                  <div className={`${fadeClass} h-8 w-12 rounded-lg`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ManagerSkeletonAlert() {
  return (
    <div className="bg-white rounded-xl border border-[#dbe6e3] p-4">
      <div className="flex items-center gap-3">
        <div className={`${fadeClass} w-10 h-10 rounded-full`} />
        <div className="flex-1 space-y-2">
          <div className={`${fadeClass} h-4 w-3/4`} />
          <div className={`${fadeClass} h-3 w-1/2`} />
        </div>
        <div className={`${fadeClass} w-8 h-8 rounded-full`} />
      </div>
    </div>
  );
}

export function ManagerSkeletonChipRow({ count = 4 }) {
  return (
    <div className="flex gap-2 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`chip-${i}`}
          className={`${fadeClass} h-9 w-24 rounded-full`}
        />
      ))}
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
          {type === "dashboard" && (
            <>
              <ManagerSkeletonHero className="h-44" />
              <ManagerSkeletonMetrics count={2} />
              <div className="bg-white rounded-xl border border-[#dbe6e3] p-4 space-y-3">
                <div className={`${fadeClass} h-4 w-40`} />
                <div className={`${fadeClass} h-24 rounded-lg`} />
                <div className="grid grid-cols-2 gap-3">
                  <div className={`${fadeClass} h-14 rounded-lg`} />
                  <div className={`${fadeClass} h-14 rounded-lg`} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-[#dbe6e3] p-4 space-y-3">
                <div className={`${fadeClass} h-4 w-32`} />
                <div className={`${fadeClass} h-48 rounded-lg`} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`quick-${i}`}
                    className={`${fadeClass} h-24 rounded-xl`}
                  />
                ))}
              </div>
            </>
          )}

          {type === "deposits" && (
            <>
              <ManagerSkeletonChipRow count={2} />
              <ManagerSkeletonHero className="h-56" />
              <ManagerSkeletonMetrics count={2} />
              <ManagerSkeletonTabs />
              <div className="bg-white rounded-xl border border-[#dbe6e3] p-4 space-y-3">
                <div className={`${fadeClass} h-5 w-32`} />
                <div className={`${fadeClass} h-56 rounded-lg`} />
              </div>
              <ManagerSkeletonList count={3} />
            </>
          )}

          {type === "pendingDeliveries" && (
            <>
              <ManagerSkeletonAlert />
              <ManagerSkeletonMetrics count={3} />
              <ManagerSkeletonList count={4} />
            </>
          )}

          {type === "payments" && (
            <>
              <ManagerSkeletonMetrics count={3} />
              <ManagerSkeletonSearch withButton />
              <ManagerSkeletonList count={4} compact />
            </>
          )}

          {type === "table" && (
            <>
              <div className="space-y-2">
                <div className={`${fadeClass} h-8 w-56`} />
                <div className={`${fadeClass} h-4 w-96`} />
              </div>
              <ManagerSkeletonSearch withButton />
              <ManagerSkeletonTable rows={6} />
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
              <ManagerSkeletonHero className="h-44" />
              <ManagerSkeletonChipRow count={4} />
              <ManagerSkeletonMetrics count={2} />
              <ManagerSkeletonMetrics count={2} />
              <div className="bg-white rounded-xl border border-[#dbe6e3] p-4 space-y-3">
                <div className={`${fadeClass} h-4 w-40`} />
                <div className={`${fadeClass} h-36 rounded-lg`} />
              </div>
              <ManagerSkeletonList count={3} compact />
            </>
          )}

          {type === "account" && (
            <>
              <ManagerSkeletonHero className="h-36" />
              <ManagerSkeletonChipRow count={4} />
              <div className="bg-white rounded-xl border border-[#dbe6e3] p-4 space-y-3">
                <div className={`${fadeClass} h-5 w-28`} />
                <div className={`${fadeClass} h-52 rounded-lg`} />
              </div>
              <div className="space-y-3">
                <div className={`${fadeClass} h-16 rounded-xl`} />
                <div className={`${fadeClass} h-16 rounded-xl`} />
              </div>
            </>
          )}

          {type === "reports" && (
            <>
              <ManagerSkeletonChipRow count={4} />
              <ManagerSkeletonHero className="h-36" />
              <ManagerSkeletonMetrics count={3} />
              <div className="bg-white rounded-xl border border-[#dbe6e3] p-4">
                <div className={`${fadeClass} h-5 w-36 mb-3`} />
                <div className={`${fadeClass} h-56 rounded-lg`} />
              </div>
              <ManagerSkeletonList count={3} compact />
            </>
          )}

          {type === "notification" && (
            <>
              <ManagerSkeletonHero className="h-40" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`notif-card-${i}`}
                    className="bg-white rounded-xl border border-[#dbe6e3] p-4 space-y-3"
                  >
                    <div className={`${fadeClass} w-12 h-12 rounded-xl`} />
                    <div className={`${fadeClass} h-4 w-2/3`} />
                    <div className={`${fadeClass} h-3 w-full`} />
                    <div className={`${fadeClass} h-3 w-1/2`} />
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-[#dbe6e3] p-4 space-y-3">
                <div className={`${fadeClass} h-5 w-40`} />
                <ManagerSkeletonList count={2} compact />
              </div>
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
