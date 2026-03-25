import { NextResponse } from "next/server";
import { ensureDefaultPdfImported } from "@/lib/importers/service";
import { getOverviewStats } from "@/lib/local-db";

export async function GET() {
  try {
    await ensureDefaultPdfImported();
    const stats = await getOverviewStats();
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao calcular estatisticas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
