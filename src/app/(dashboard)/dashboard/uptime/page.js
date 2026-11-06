import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import UptimeClient from "./components/UptimeClient";

export const metadata = {
  title: "Uptime & Health",
};

export default function UptimePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UptimeClient />
    </Suspense>
  );
}
