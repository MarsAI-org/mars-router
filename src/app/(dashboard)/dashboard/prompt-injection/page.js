import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import PromptInjectionClient from "./components/PromptInjectionClient";

export const metadata = {
  title: "Prompt Injection",
};

export default function PromptInjectionPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <PromptInjectionClient />
    </Suspense>
  );
}
