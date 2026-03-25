import { NextResponse } from "next/server";
import { importQuestionsFromPdf } from "@/lib/importers/service";

type ImportRequest = {
  sourcePath?: string;
  title?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ImportRequest;
    const result = await importQuestionsFromPdf({
      sourcePath: body.sourcePath,
      title: body.title,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado na importação.";
    const status = message.includes("Nenhum PDF") || message.includes("Não foi possível extrair") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
