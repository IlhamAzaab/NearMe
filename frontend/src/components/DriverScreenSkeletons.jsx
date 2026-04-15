import React from "react";

function Block({ className = "" }) {
  return (
    <div className={`bg-gray-200 rounded-xl skeleton-fade ${className}`} />
  );
}

export function DriverDashboardSkeleton() {
  return (
    <div
      className="max-w-md mx-auto min-h-screen bg-[#f8faf9] border-x border-slate-200"
      data-driver-stagger
    >
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <Block className="w-10 h-10 rounded-full" />
          <Block className="w-24 h-7 rounded-md" />
          <Block className="w-10 h-10 rounded-full" />
        </div>
      </div>

      <div className="p-4 space-y-4 pb-28">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 flex-1">
              <Block className="w-40 h-5" />
              <Block className="w-32 h-3" />
            </div>
            <Block className="w-12 h-7 rounded-full" />
          </div>
          <div className="h-9 rounded-lg bg-slate-100 p-1">
            <Block className="h-full w-1/2 rounded-md" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-2">
            <Block className="h-3 w-24" />
            <Block className="h-8 w-28" />
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-2">
            <Block className="h-3 w-24" />
            <Block className="h-8 w-20" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-2">
          <Block className="h-3 w-28" />
          <Block className="h-8 w-36" />
        </div>

        <div className="flex items-center justify-between pt-1">
          <Block className="w-40 h-6 rounded-md" />
          <Block className="w-16 h-5 rounded-md" />
        </div>

        {[...Array(2)].map((_, i) => (
          <div
            key={`dashboard-active-skeleton-item-${i}`}
            className="bg-white rounded-2xl border border-slate-100 p-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Block className="w-24 h-4" />
                <Block className="w-14 h-6 rounded-full" />
              </div>
              <div className="flex items-center gap-3">
                <Block className="w-11 h-11 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Block className="w-3/4 h-4" />
                  <Block className="w-full h-3" />
                </div>
              </div>
              <div className="flex gap-2">
                <Block className="h-10 flex-1 rounded-lg" />
                <Block className="h-10 w-24 rounded-lg" />
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between pt-1">
          <Block className="w-44 h-6 rounded-md" />
          <Block className="w-20 h-5 rounded-md" />
        </div>

        {[...Array(3)].map((_, i) => (
          <div
            key={`dashboard-nearby-skeleton-item-${i}`}
            className="bg-white rounded-2xl border border-slate-100 p-3"
          >
            <div className="flex items-center gap-3">
              <Block className="w-11 h-11 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Block className="w-24 h-4" />
                <Block className="w-full h-3" />
                <Block className="w-2/3 h-3" />
              </div>
              <div className="space-y-2">
                <Block className="w-16 h-4" />
                <Block className="w-12 h-3" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Block className="w-14 h-12 rounded-lg" />
              <Block className="flex-1 h-12 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DriverActiveSkeleton() {
  return (
    <div className="relative h-[calc(100vh-5rem)] overflow-hidden">
      <Block className="absolute inset-0 rounded-none bg-gray-300" />
      <Block className="absolute top-4 left-4 w-10 h-10 rounded-full" />

      <div className="absolute bottom-0 left-0 right-0 z-40 bg-white rounded-t-[28px] p-4 pb-6 border-t border-slate-100">
        <div className="flex justify-center mb-3">
          <Block className="w-14 h-1.5 rounded-full" />
        </div>
        <div className="space-y-3">
          <Block className="w-24 h-5" />
          <Block className="w-36 h-4" />
          <Block className="w-full h-18 rounded-2xl" />
          <Block className="w-full h-10 rounded-full bg-green-200" />
        </div>
      </div>
    </div>
  );
}

export function DriverAvailableSkeleton() {
  return (
    <div className="relative h-[calc(100vh-5rem)] overflow-hidden">
      <Block className="absolute inset-0 rounded-none bg-gray-300" />
      <Block className="absolute top-4 left-4 w-10 h-10 rounded-full" />
      <Block className="absolute top-4 right-4 w-20 h-9 rounded-full" />

      <div className="absolute bottom-0 left-0 right-0 z-40 bg-white rounded-t-[28px] px-5 pt-5 pb-7 border-t border-slate-100">
        <div className="space-y-3">
          <div className="flex justify-center">
            <Block className="w-24 h-6 rounded-md" />
          </div>
          <div className="flex justify-center">
            <Block className="w-20 h-3 rounded" />
          </div>

          <div className="flex justify-center gap-2 pt-1">
            <Block className="w-20 h-6 rounded-full" />
            <Block className="w-20 h-6 rounded-full bg-green-100" />
            <Block className="w-16 h-6 rounded-full" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Block className="h-6" />
            <Block className="h-6" />
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <Block className="w-3 h-3 rounded-full bg-green-100" />
                <Block className="w-0.5 h-9 rounded-none" />
              </div>
              <div className="flex-1 space-y-2">
                <Block className="w-12 h-3" />
                <Block className="w-36 h-4" />
                <Block className="w-44 h-3" />
              </div>
            </div>
            <div className="flex gap-3">
              <Block className="w-3 h-3 rounded-full" />
              <div className="flex-1 space-y-2">
                <Block className="w-12 h-3" />
                <Block className="w-28 h-4" />
                <Block className="w-36 h-3" />
              </div>
            </div>
          </div>

          <Block className="w-28 h-3" />

          <div className="flex gap-3 pt-1">
            <Block className="h-12 flex-1 rounded-full bg-green-200" />
            <Block className="w-14 h-10 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DriverListSkeleton({ count = 4, variant = "default" }) {
  const renderCard = (index) => {
    if (variant === "notifications") {
      return (
        <div
          key={`driver-list-skeleton-${variant}-${index}`}
          className="bg-white rounded-xl p-4 border border-slate-100"
        >
          <div className="flex items-start gap-3">
            <Block className="w-12 h-12 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Block className="w-36 h-4" />
              <Block className="w-full h-3" />
              <Block className="w-3/4 h-3" />
              <div className="flex items-center justify-between pt-1">
                <Block className="w-20 h-3" />
                <Block className="w-14 h-6 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (variant === "history") {
      return (
        <div
          key={`driver-list-skeleton-${variant}-${index}`}
          className="bg-white rounded-2xl p-4 border border-slate-100"
        >
          <div className="flex items-start gap-3">
            <Block className="w-12 h-12 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Block className="w-32 h-4" />
              <Block className="w-24 h-3" />
              <Block className="w-full h-3" />
            </div>
            <div className="space-y-2 text-right">
              <Block className="w-16 h-4" />
              <Block className="w-12 h-3" />
            </div>
          </div>
        </div>
      );
    }

    if (variant === "activity") {
      return (
        <div
          key={`driver-list-skeleton-${variant}-${index}`}
          className="bg-white rounded-xl p-4 border border-slate-100"
        >
          <div className="flex items-center gap-3">
            <Block className="w-10 h-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Block className="w-28 h-4" />
              <Block className="w-20 h-3" />
            </div>
            <div className="text-right space-y-2">
              <Block className="w-14 h-4" />
              <Block className="w-10 h-3" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={`driver-list-skeleton-${variant}-${index}`}
        className="bg-white rounded-xl p-4 border border-slate-100"
      >
        <div className="flex items-start gap-3">
          <Block className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Block className="w-32 h-4" />
            <Block className="w-full h-3" />
            <Block className="w-2/3 h-3" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => renderCard(i))}
    </div>
  );
}
