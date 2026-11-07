import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import FlowControlClient from "./components/FlowControlClient";

export const metadata = {
  title: "Upstream Flow Control",
};

export default function FlowControlPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <FlowControlClient />
    </Suspense>
  );
}
