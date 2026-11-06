import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { sanitizePromptInjections } from "@/lib/settingsSanitizers.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

// GET /api/prompt-injections - current operator prompt injections
export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ promptInjections: settings.promptInjections || [] }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load prompt injections" }, { status: 500 });
  }
}

// PUT /api/prompt-injections - replace the whole list (validated)
export async function PUT(request) {
  try {
    const body = await request.json();
    const list = sanitizePromptInjections(Array.isArray(body) ? body : body?.promptInjections);
    await updateSettings({ promptInjections: list });
    return NextResponse.json({ promptInjections: list }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save prompt injections" }, { status: 400 });
  }
}
