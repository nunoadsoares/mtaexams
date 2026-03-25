import { NextResponse } from "next/server";
import { ensureDefaultPdfImported } from "@/lib/importers/service";
import { getProfileSummary } from "@/lib/local-db";

export async function GET() {
  try {
    await ensureDefaultPdfImported();
    const profile = await getProfileSummary();
    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao calcular perfil.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
