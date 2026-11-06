import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { normalizeCatalog, applyCatalogOverrides } from "@/lib/modelCatalog.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

// GET /api/model-catalog - current catalog control + a preview of the effective
// order (so the dashboard can show what /v1/models will publish).
export async function GET() {
  try {
    const settings = await getSettings();
    const catalog = normalizeCatalog(settings.modelCatalog);
    return NextResponse.json({ catalog }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load model catalog" }, { status: 500 });
  }
}

// PUT /api/model-catalog - replace the catalog control.
// Body: { hidden: string[], displayNames: { [id]: string }, order: string[] }
export async function PUT(request) {
  try {
    const body = await request.json();
    const catalog = normalizeCatalog(body);
    await updateSettings({ modelCatalog: catalog });
    return NextResponse.json({ catalog }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save model catalog" }, { status: 400 });
  }
}

// POST /api/model-catalog/preview - apply overrides to a provided list (utility
// for the dashboard to render the exact published order without a full /v1 call).
export async function POST(request) {
  try {
    const body = await request.json();
    const models = Array.isArray(body?.models) ? body.models : [];
    const applied = applyCatalogOverrides(models, body?.catalog);
    return NextResponse.json({ models: applied }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: "Failed to preview catalog" }, { status: 400 });
  }
}
