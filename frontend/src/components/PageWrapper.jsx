import React from "react";

export default function PageWrapper({
  children,
  isFetching = false,
  dataKey = "stable",
}) {
  return (
    <div
      key={dataKey}
      className={`transition-opacity duration-300 ${isFetching ? "opacity-90" : "opacity-100"}`}
    >
      {children}
    </div>
  );
}
