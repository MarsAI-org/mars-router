import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import ModelCatalogClient from "./components/ModelCatalogClient";

export const metadata = {
  title: "Model Catalog",
};

export default function ModelCatalogPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ModelCatalogClient />
    </Suspense>
  );
}
