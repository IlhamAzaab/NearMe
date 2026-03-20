import React from "react";
import { PageSkeleton } from "./Skeleton";

export default function AdminSkeleton({ type = "list" }) {
  return <PageSkeleton type={type} />;
}
