import { NextResponse } from "next/server";
import { ensureDefaultPdfImported } from "@/lib/importers/service";
import { getAllQuestions, startQuizSession } from "@/lib/local-db";

type StartQuizRequest = {
  mode?: "random" | "wrong_only" | "unseen_only";
  topic?: string;
  limit?: number;
};

export async function POST(request: Request) {
  try {
    await ensureDefaultPdfImported();

    const body = (await request.json().catch(() => ({}))) as StartQuizRequest;
    const mode = body.mode ?? "random";
    const limit = Math.min(Math.max(body.limit ?? 10, 1), 50);
    const allQuestions = await getAllQuestions();

    if (allQuestions.length === 0) {
      return NextResponse.json({ error: "Nao existem perguntas para iniciar o quiz." }, { status: 400 });
    }

    const result = await startQuizSession({
      mode,
      topic: body.topic,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao iniciar quiz.";
    const status = message.includes("Nenhuma pergunta disponivel") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
