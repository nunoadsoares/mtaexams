import { NextResponse } from "next/server";
import { submitQuizSession } from "@/lib/local-db";

type QuizAnswerInput = {
  questionId: string;
  selectedAnswers: string[];
  responseTimeMs?: number;
};

type SubmitQuizRequest = {
  answers: QuizAnswerInput[];
};

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const body = (await request.json()) as SubmitQuizRequest;
    const params = await context.params;

    if (!body.answers || body.answers.length === 0) {
      return NextResponse.json({ error: "Sem respostas para submeter." }, { status: 400 });
    }

    const result = await submitQuizSession(params.sessionId, body.answers);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao submeter quiz.";
    const status =
      message.includes("Sessao nao encontrada") || message.includes("Sem respostas") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
