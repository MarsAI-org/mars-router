import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import BillingDashboard from "./components/BillingDashboard";

export const metadata = {
  title: "Billing & Sales",
};

export default function BillingPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <BillingDashboard />
    </Suspense>
  );
}
