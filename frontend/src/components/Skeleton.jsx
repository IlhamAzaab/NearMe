import React from "react";

// Base skeleton shimmer animation
const shimmerClass = "animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]";

// Basic skeleton shapes
export function SkeletonBox({ className = "" }) {
  return <div className={`${shimmerClass} rounded ${className}`} />;
}

export function SkeletonCircle({ size = "12" }) {
  return <div className={`${shimmerClass} rounded-full w-${size} h-${size}`} />;
}

export function SkeletonText({ lines = 1, className = "", width = "full" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`${shimmerClass} h-4 rounded`}
          style={{ width: width }}
        />
      ))}
    </div>
  );
}

// Button skeleton
export function SkeletonButton({ className = "" }) {
  return (
    <div className={`${shimmerClass} h-11 rounded-lg flex-1 ${className}`} />
  );
}

// Card skeleton for list items
export function SkeletonCard({ showImage = false, showAction = false }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
      <div className="flex items-center gap-4">
        {showImage && (
          <div className="w-14 h-14 bg-gray-200 rounded-full shrink-0" />
        )}
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="text-right space-y-2">
          <div className="h-5 bg-gray-200 rounded w-16 ml-auto" />
          <div className="h-4 bg-gray-200 rounded w-14 ml-auto" />
        </div>
      </div>
      {showAction && (
        <div className="mt-4 flex items-center gap-3">
          <div className="w-20 h-14 bg-gray-200 rounded-lg" />
          <div className="flex-1 h-10 bg-gray-200 rounded-lg" />
        </div>
      )}
    </div>
  );
}

// Deposit card skeleton
export function SkeletonDepositCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="flex items-center gap-4 p-4">
        <div className="w-12 h-12 bg-gray-200 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-200 rounded w-28" />
        </div>
        <div className="text-right space-y-2">
          <div className="h-5 bg-gray-200 rounded w-20 ml-auto" />
          <div className="h-4 bg-gray-200 rounded w-16 ml-auto" />
        </div>
      </div>
      <div className="px-4 pb-4 flex items-center gap-3">
        <div className="w-20 h-14 bg-gray-200 rounded-lg" />
        <div className="flex-1 h-10 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}

// Hero/Summary card skeleton
export function SkeletonHeroCard() {
  return (
    <div className="bg-gray-200 rounded-2xl p-6 animate-pulse">
      <div className="flex justify-between items-start mb-6">
        <div className="space-y-2">
          <div className="h-4 bg-gray-300 rounded w-28" />
          <div className="h-10 bg-gray-300 rounded w-36" />
          <div className="h-4 bg-gray-300 rounded w-24" />
        </div>
        <div className="w-10 h-10 bg-gray-300 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-gray-300 pt-4">
        <div className="space-y-2">
          <div className="h-3 bg-gray-300 rounded w-20" />
          <div className="h-6 bg-gray-300 rounded w-24" />
        </div>
        <div className="space-y-2 border-l border-gray-300 pl-4">
          <div className="h-3 bg-gray-300 rounded w-20" />
          <div className="h-6 bg-gray-300 rounded w-24" />
        </div>
      </div>
    </div>
  );
}

// Metric cards skeleton
export function SkeletonMetricCards({ count = 2 }) {
  return (
    <div className="flex gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex-1 bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 bg-gray-200 rounded" />
            <div className="h-3 bg-gray-200 rounded w-16" />
          </div>
          <div className="h-7 bg-gray-200 rounded w-24" />
        </div>
      ))}
    </div>
  );
}

// Delivery card skeleton
export function SkeletonDeliveryCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 bg-gray-200 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
        <div className="space-y-1">
          <div className="h-5 bg-gray-200 rounded w-16 ml-auto" />
          <div className="h-3 bg-gray-200 rounded w-12 ml-auto" />
        </div>
      </div>
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded-full" />
          <div className="h-3 bg-gray-200 rounded flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded-full" />
          <div className="h-3 bg-gray-200 rounded flex-1" />
        </div>
      </div>
      <div className="h-11 bg-gray-200 rounded-lg" />
    </div>
  );
}

// Order card skeleton
export function SkeletonOrderCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-16 h-16 bg-gray-200 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-gray-100">
        <div className="h-5 bg-gray-200 rounded w-20" />
        <div className="h-8 bg-gray-200 rounded w-24" />
      </div>
    </div>
  );
}

// List skeleton wrapper
export function SkeletonList({ count = 3, children }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}>{children}</React.Fragment>
      ))}
    </div>
  );
}

// Page loading skeleton
export function PageSkeleton({ type = "list" }) {
  if (type === "deposits") {
    return (
      <div className="p-4 space-y-4">
        <SkeletonHeroCard />
        <SkeletonMetricCards count={2} />
        <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />
        <SkeletonList count={3}>
          <SkeletonDepositCard />
        </SkeletonList>
      </div>
    );
  }

  if (type === "deliveries") {
    return (
      <div className="p-4 space-y-4">
        <SkeletonHeroCard />
        <SkeletonList count={3}>
          <SkeletonDeliveryCard />
        </SkeletonList>
      </div>
    );
  }

  if (type === "orders") {
    return (
      <div className="p-4 space-y-4">
        <SkeletonList count={4}>
          <SkeletonOrderCard />
        </SkeletonList>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <SkeletonList count={4}>
        <SkeletonCard showImage showAction />
      </SkeletonList>
    </div>
  );
}

export default {
  SkeletonBox,
  SkeletonCircle,
  SkeletonText,
  SkeletonButton,
  SkeletonCard,
  SkeletonDepositCard,
  SkeletonHeroCard,
  SkeletonMetricCards,
  SkeletonDeliveryCard,
  SkeletonOrderCard,
  SkeletonList,
  PageSkeleton,
};
