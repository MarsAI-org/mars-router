import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimitsClient from "./components/ProviderLimitsClient";

export const metadata = {
  title: "Provider Limits",
};

export default function ProviderLimitsPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ProviderLimitsClient />
    </Suspense>
  );
}
