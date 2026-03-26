"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getLocalOverviewStats, saveLocalSession } from "@/lib/client-progress";

type StatsResponse = {
  completedSessions: number;
  passRate: number;
  accuracy: number;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  topic: string;
  correctAnswer: string;
  correctAnswers: string[];
  questionType: "multiple_choice" | "multiple_select";
  options: Array<{
    id: string;
    label: string;
    text: string;
  }>;
};

type QuizStartResponse = {
  sessionId: string;
  questions: QuizQuestion[];
};

type SessionReport = {
  score: number;
  total: number;
  accuracy: number;
  correctAnswers: number;
  wrongAnswers: number;
  passed: boolean;
  passThreshold: number;
};

type AnswerState = {
  selectedAnswers: string[];
  isCorrect: boolean;
};

function normalizeForComparison(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeAnswerSet(values: string[]): string[] {
  return values
    .map((value) => normalizeForComparison(value))
    .filter(Boolean)
    .sort();
}

export function QuizDashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [mode, setMode] = useState<"random" | "wrong_only" | "unseen_only">("random");
  const [sessionMode, setSessionMode] = useState<"random" | "wrong_only" | "unseen_only">("random");
  const [limit, setLimit] = useState(20);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [draftSelections, setDraftSelections] = useState<Record<string, string[]>>({});
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionReport, setSessionReport] = useState<SessionReport | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [message, setMessage] = useState("");

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const correctCount = useMemo(
    () => Object.values(answers).filter((answer) => answer.isCorrect).length,
    [answers]
  );
  const wrongCount = answeredCount - correctCount;

  const hasActiveQuiz = quizQuestions.length > 0 && !sessionReport;
  const currentQuestion = hasActiveQuiz ? quizQuestions[currentIndex] : null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const currentDraftSelection = currentQuestion ? draftSelections[currentQuestion.id] : undefined;
  const progressPercent =
    quizQuestions.length > 0 ? Math.max(4, Math.round((answeredCount / quizQuestions.length) * 100)) : 0;
  const reviewItems = useMemo(
    () =>
      quizQuestions.map((question, index) => {
        const answer = answers[question.id];
        return {
          index: index + 1,
          question,
          selectedAnswers: answer?.selectedAnswers ?? [],
          isCorrect: answer?.isCorrect ?? false,
        };
      }),
    [answers, quizQuestions]
  );

  useEffect(() => {
    void refreshStats();
  }, []);

  async function refreshStats() {
    const localStats = getLocalOverviewStats();

    try {
      const response = await fetch("/api/stats/overview");
      const data = await response.json();

      if (!response.ok) {
        setStats(localStats);
        return;
      }

      const serverStats = {
        completedSessions: data.completedSessions,
        passRate: data.passRate,
        accuracy: data.accuracy,
      };

      setStats(
        localStats.completedSessions >= serverStats.completedSessions ? localStats : serverStats
      );
    } catch {
      setStats(localStats);
    }
  }

  async function startQuiz(nextLimit: number) {
    setIsStartingQuiz(true);
    setMessage("");
    setSessionReport(null);
    setIsReviewing(false);

    const response = await fetch("/api/quiz/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, limit: nextLimit }),
    });

    const data = (await response.json()) as QuizStartResponse | { error: string };

    if (!response.ok) {
      setMessage((data as { error: string }).error || "Erro ao iniciar quiz.");
      setIsStartingQuiz(false);
      return;
    }

    const payload = data as QuizStartResponse;
    setSessionMode(mode);
    setSessionId(payload.sessionId);
    setQuizQuestions(payload.questions);
    setDraftSelections({});
    setAnswers({});
    setCurrentIndex(0);
    setSessionReport(null);
    setMessage("");
    setIsStartingQuiz(false);
  }

  function handleAnswer(optionText: string) {
    if (!currentQuestion || currentAnswer) {
      return;
    }

    setDraftSelections((prev) => ({
      ...prev,
      [currentQuestion.id]:
        currentQuestion.questionType === "multiple_select"
          ? prev[currentQuestion.id]?.includes(optionText)
            ? prev[currentQuestion.id].filter((value) => value !== optionText)
            : [...(prev[currentQuestion.id] ?? []), optionText]
          : [optionText],
    }));
  }

  function validateCurrentAnswer() {
    if (!currentQuestion || currentAnswer || !currentDraftSelection) {
      return;
    }

    const isCorrect =
      JSON.stringify(normalizeAnswerSet(currentQuestion.correctAnswers)) ===
      JSON.stringify(normalizeAnswerSet(currentDraftSelection));

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        selectedAnswers: currentDraftSelection,
        isCorrect,
      },
    }));
  }

  function goPrevious() {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  async function goNextOrSubmit() {
    if (!currentQuestion || !currentAnswer) {
      return;
    }

    if (currentIndex < quizQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    if (!sessionId) {
      return;
    }

    setIsSubmittingQuiz(true);

    const payload = quizQuestions.map((question) => ({
      questionId: question.id,
      selectedAnswers: answers[question.id]?.selectedAnswers ?? [],
    }));

    const response = await fetch(`/api/quiz/${sessionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Erro ao submeter quiz.");
      setIsSubmittingQuiz(false);
      return;
    }

    setSessionReport({
      score: data.score,
      total: data.total,
      accuracy: data.accuracy,
      correctAnswers: data.correctAnswers,
      wrongAnswers: data.wrongAnswers,
      passed: data.passed,
      passThreshold: data.passThreshold,
    });
    saveLocalSession({
      mode: sessionMode,
      score: data.score,
      totalQuestions: data.total,
      accuracy: data.accuracy,
      passed: data.passed,
      passThreshold: data.passThreshold,
    });
    setIsReviewing(false);
    setIsSubmittingQuiz(false);
    await refreshStats();
  }

  function resetQuiz() {
    setSessionId(null);
    setQuizQuestions([]);
    setDraftSelections({});
    setAnswers({});
    setCurrentIndex(0);
    setSessionReport(null);
    setIsReviewing(false);
    setMessage("");
  }

  function retryQuiz() {
    const nextLimit = Math.min(Math.max(quizQuestions.length || limit, 1), 50);
    resetQuiz();
    void startQuiz(nextLimit);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      {!hasActiveQuiz && !sessionReport ? (
        <section className="overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,22,38,0.94),rgba(9,13,22,0.98))] px-6 py-8 shadow-[0_35px_90px_rgba(0,0,0,0.45)] sm:px-8 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.28em] text-[#88a6dd]">Elite Study Interface</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">
                Para deixares de ser besunta e não levares vermelho
              </h1>
              <p className="mt-4 max-w-xl text-base leading-8 text-[#97abd0]">
                Experiencia limpa, foco total na pergunta, e estatisticas curtas no fim. Sem ruido, sem confusao.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => startQuiz(Math.min(Math.max(limit, 1), 50))}
                  disabled={isStartingQuiz}
                  className="rounded-full bg-[#a7c0ff] px-6 py-3 text-sm font-semibold text-[#08142d] transition hover:bg-[#bbd0ff] disabled:opacity-60"
                >
                  {isStartingQuiz ? "A preparar..." : "Comecar quiz"}
                </button>
                <button
                  type="button"
                  onClick={() => startQuiz(50)}
                  disabled={isStartingQuiz}
                  className="rounded-full border border-[#294372] bg-[#101a2b] px-6 py-3 text-sm font-semibold text-[#c8d8ff] transition hover:bg-[#16243b] disabled:opacity-60"
                >
                  Teste final 50
                </button>
                <Link
                  href="/profile"
                  className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Ver perfil
                </Link>
              </div>

              {message ? <p className="mt-4 text-sm text-[#ff9ca5]">{message}</p> : null}
            </div>

            <div className="grid gap-3 self-start sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Modo</p>
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as "random" | "wrong_only" | "unseen_only")}
                  className="mt-3 w-full rounded-2xl border border-white/8 bg-[#0d1422] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-[#507eff]"
                >
                  <option value="random">Aleatorio</option>
                  <option value="wrong_only">Erradas</option>
                  <option value="unseen_only">Nao vistas</option>
                </select>
              </div>

              <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Perguntas</p>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value) || 20)}
                  className="mt-3 w-full rounded-2xl border border-white/8 bg-[#0d1422] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-[#507eff]"
                />
              </div>

              <div className="rounded-[28px] border border-[#213456] bg-[linear-gradient(180deg,rgba(20,32,56,0.9),rgba(11,17,29,0.92))] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Resumo</p>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#6d83ac]">Sessoes</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{stats?.completedSessions ?? "--"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#6d83ac]">Pass</p>
                    <p className="mt-1 text-2xl font-semibold text-[#a8c1ff]">{stats?.passRate ?? "--"}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#6d83ac]">Acc</p>
                    <p className="mt-1 text-2xl font-semibold text-[#9be0b0]">{stats?.accuracy ?? "--"}%</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center justify-end pt-1">
                <p className="text-center text-[11px] uppercase tracking-[0.22em] text-[#9fb8e8]">
                  A cara da app
                </p>
                <Image
                  src="/Niggachad_normal.png"
                  alt="Mascote normal"
                  width={420}
                  height={420}
                  className="mt-1 h-auto w-[230px] object-contain drop-shadow-[0_22px_36px_rgba(0,0,0,0.5)] sm:w-[300px] lg:w-[340px]"
                  priority
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {hasActiveQuiz && currentQuestion ? (
        <section className="overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,27,0.96),rgba(7,10,16,0.98))] px-5 py-6 shadow-[0_40px_100px_rgba(0,0,0,0.5)] sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#22304f]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#c7d7ff_0%,#8cb0ff_100%)] transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="w-20 text-right text-sm font-semibold tracking-normal text-[#dde8ff] sm:text-base">
              {answeredCount}/{quizQuestions.length}
            </p>
            <div className="rounded-full border border-[#612c36] bg-[#3a1820] px-3 py-1 text-xs font-semibold text-[#ffacb4] sm:text-sm">
              {wrongCount}
            </div>
            <div className="rounded-full border border-[#29543a] bg-[#183121] px-3 py-1 text-xs font-semibold text-[#9fe4b4] sm:text-sm">
              {correctCount}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <p className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#8aa4d3]">
              Pergunta {currentIndex + 1}
            </p>
            <p className="rounded-full border border-[#20345f] bg-[#0e1730] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#a8c1ff]">
              {currentQuestion.topic}
            </p>
            {currentQuestion.questionType === "multiple_select" ? (
              <p className="rounded-full border border-[#35548f] bg-[#131f3a] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#c8d8ff]">
                Multipla
              </p>
            ) : null}
          </div>

          <div className="mt-6 max-w-4xl">
            <p className="text-sm font-semibold leading-6 tracking-normal text-white sm:text-lg">
              {currentQuestion.prompt}
            </p>
          </div>

          <div className="mt-8 grid gap-3">
            {currentQuestion.options.map((option) => {
              const isSelected = currentAnswer
                ? currentAnswer.selectedAnswers.includes(option.text)
                : (currentDraftSelection ?? []).includes(option.text);
              const isCorrectOption = currentQuestion.correctAnswers.some(
                (correctAnswer) =>
                  normalizeForComparison(option.text) === normalizeForComparison(correctAnswer)
              );

              let stateClass =
                "border-white/8 bg-[linear-gradient(180deg,rgba(27,33,45,0.95),rgba(22,27,38,0.95))] hover:border-[#4a74df] hover:bg-[linear-gradient(180deg,rgba(29,39,57,1),rgba(24,31,43,1))]";

              if (!currentAnswer && isSelected) {
                stateClass =
                  "border-[#4b74de] bg-[linear-gradient(180deg,rgba(23,35,67,1),rgba(18,28,56,1))]";
              }

              if (currentAnswer && isCorrectOption) {
                stateClass = "border-[#34654c] bg-[linear-gradient(180deg,rgba(24,45,33,1),rgba(20,35,27,1))]";
              }

              if (currentAnswer && isSelected && !currentAnswer.isCorrect && !isCorrectOption) {
                stateClass = "border-[#8f3946] bg-[linear-gradient(180deg,rgba(50,23,31,1),rgba(39,19,24,1))] animate-shake";
              }

              if (currentAnswer && isSelected && currentAnswer.isCorrect && isCorrectOption) {
                stateClass =
                  "border-[#34654c] bg-[linear-gradient(180deg,rgba(24,45,33,1),rgba(20,35,27,1))] animate-pop";
              }

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleAnswer(option.text)}
                  disabled={Boolean(currentAnswer)}
                  className={`w-full rounded-[18px] border px-4 py-3 text-left transition sm:px-4 sm:py-4 ${stateClass} ${currentAnswer ? "cursor-default" : "cursor-pointer"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[11px] font-semibold text-[#c7d6f6]">
                      {option.label}
                    </span>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <span className="pt-0.5 text-xs font-medium leading-5 text-[#f4f7ff] sm:text-sm">
                        {option.text}
                      </span>
                      {currentAnswer && isCorrectOption ? (
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#4f9d6c] bg-[#1c3d2a]">
                          <svg
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-[#9fe4b4]"
                            fill="none"
                          >
                            <path
                              d="M3 8.5L6.4 11.5L13 4.5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {!currentAnswer ? (
            <div className="mt-5">
              <p className="text-xs text-[#9fb3d8]">
                {currentQuestion.questionType === "multiple_select"
                  ? "Escolhe uma ou mais opcoes e valida. So conta certo se marcares o conjunto completo."
                  : "Escolhe uma opcao e valida para registar certo/errado."}
              </p>
            </div>
          ) : (
            <div className="mt-5">
              <p className={`text-xs font-medium ${currentAnswer.isCorrect ? "text-[#9fe4b4]" : "text-[#ffacb4]"}`}>
                {currentAnswer.isCorrect
                  ? "Resposta correta validada."
                  : currentQuestion.questionType === "multiple_select"
                    ? "Resposta errada validada. Era preciso acertar o conjunto completo."
                    : "Resposta errada validada."}
              </p>
            </div>
          )}

          <div className="mt-12 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={goPrevious}
              disabled={currentIndex === 0}
              className="rounded-full px-1 py-2 text-xs font-semibold text-[#a5b7d9] transition hover:text-white disabled:opacity-35 sm:px-3 sm:text-sm"
            >
              Anterior
            </button>
            <div className="flex items-center gap-3">
              {!currentAnswer ? (
                <button
                  type="button"
                  onClick={validateCurrentAnswer}
                  disabled={!currentDraftSelection || currentDraftSelection.length === 0}
                  className="rounded-full border border-[#35548f] bg-[#131f3a] px-6 py-2 text-xs font-semibold text-[#c8d8ff] transition hover:bg-[#1a2a4e] disabled:opacity-55 sm:text-sm"
                >
                  Validar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNextOrSubmit}
                  disabled={isSubmittingQuiz}
                  className="rounded-full bg-[linear-gradient(180deg,#bbd0ff_0%,#92b3ff_100%)] px-6 py-2 text-xs font-semibold text-[#09162f] shadow-[0_12px_30px_rgba(92,130,255,0.35)] transition hover:brightness-105 disabled:opacity-55 sm:text-sm"
                >
                  {isSubmittingQuiz ? "A submeter..." : currentIndex === quizQuestions.length - 1 ? "Finalizar" : "Seguinte"}
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {sessionReport && !isReviewing ? (
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,18,31,0.96),rgba(8,12,20,0.98))] px-6 py-8 shadow-[0_35px_90px_rgba(0,0,0,0.48)] sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#8aa5d7]">Resumo do quiz</p>
              <h2
                className={`mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl ${sessionReport.passed ? "text-[#9fe4b4]" : "text-[#ff8f8f]"}`}
              >
                {sessionReport.passed ? "APROVADO" : "Chumbaste!!!"}
              </h2>
              <p className="mt-4 text-sm text-[#b8c7e5] sm:text-base">
                {sessionReport.passed
                  ? `Conseguiste ${sessionReport.accuracy}% e passaste com sucesso.`
                  : `Ficaste com ${sessionReport.accuracy}%. Precisavas de ${sessionReport.passThreshold}% para passar.`}
              </p>
            </div>

            <div className="flex w-full justify-center sm:w-auto sm:justify-end">
              <div className="flex items-end gap-4">
                {!sessionReport.passed ? (
                  <div className="relative h-40 w-28 rounded-xl border-2 border-[#ff5d5d] bg-[linear-gradient(180deg,#ff5d5d_0%,#c51f2c_100%)] shadow-[0_16px_35px_rgba(197,31,44,0.45)] sm:rotate-[-8deg]">
                    <span className="absolute left-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/10 text-xs font-bold text-white">
                      !
                    </span>
                    <p className="absolute bottom-4 left-0 w-full text-center text-xs font-bold uppercase tracking-[0.18em] text-white">
                      CHUMBASTE
                    </p>
                  </div>
                ) : null}

                <Image
                  src={sessionReport.passed ? "/Niggachad_happy.png" : "/Niggachad_angry.png"}
                  alt={sessionReport.passed ? "Mascote feliz" : "Mascote zangada"}
                  width={420}
                  height={420}
                  className="h-auto w-[190px] object-contain drop-shadow-[0_22px_36px_rgba(0,0,0,0.55)] sm:w-[260px] lg:w-[300px]"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7e97c4]">Resultado</p>
              <p className={`mt-3 text-3xl font-semibold ${sessionReport.passed ? "text-[#9fe4b4]" : "text-[#ff8f8f]"}`}>
                {sessionReport.passed ? "PASSOU" : "FALHOU"}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7e97c4]">Nota</p>
              <p className="mt-3 text-3xl font-semibold text-[#b9ccff]">{sessionReport.accuracy}%</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7e97c4]">Score</p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {sessionReport.score}/{sessionReport.total}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7e97c4]">Meta</p>
              <p className="mt-3 text-3xl font-semibold text-white">{sessionReport.passThreshold}%</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsReviewing(true)}
              className="rounded-full border border-[#35548f] bg-[#131f3a] px-6 py-3 text-sm font-semibold text-[#c8d8ff] transition hover:bg-[#1a2a4e]"
            >
              Rever teste
            </button>
            <button
              type="button"
              onClick={retryQuiz}
              className="rounded-full bg-[linear-gradient(180deg,#bbd0ff_0%,#92b3ff_100%)] px-6 py-3 text-sm font-semibold text-[#09162f] shadow-[0_12px_30px_rgba(92,130,255,0.35)] transition hover:brightness-105"
            >
              Voltar a fazer
            </button>
          </div>
        </section>
      ) : null}

      {sessionReport && isReviewing ? (
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,16,28,0.98),rgba(7,10,18,1))] px-6 py-8 shadow-[0_35px_90px_rgba(0,0,0,0.48)] sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#8aa5d7]">Revisao do teste</p>
              <h2 className="mt-2 text-2xl font-semibold text-white sm:text-4xl">
                Perguntas certas e erradas
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setIsReviewing(false)}
                className="rounded-full border border-[#35548f] bg-[#131f3a] px-5 py-2 text-sm font-semibold text-[#c8d8ff] transition hover:bg-[#1a2a4e]"
              >
                Voltar ao resumo
              </button>
              <button
                type="button"
                onClick={retryQuiz}
                className="rounded-full bg-[linear-gradient(180deg,#bbd0ff_0%,#92b3ff_100%)] px-5 py-2 text-sm font-semibold text-[#09162f] transition hover:brightness-105"
              >
                Voltar a fazer
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4">
            {reviewItems.map((item) => (
              <article
                key={item.question.id}
                className={`rounded-[22px] border p-5 ${item.isCorrect ? "border-[#2f5f47] bg-[linear-gradient(180deg,rgba(22,40,30,0.92),rgba(17,30,24,0.95))]" : "border-[#6f2f3a] bg-[linear-gradient(180deg,rgba(46,23,29,0.92),rgba(34,18,23,0.95))]"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#adc1e8]">
                    Pergunta {item.index}
                  </p>
                  <p
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${item.isCorrect ? "bg-[#1f4731] text-[#9fe4b4]" : "bg-[#57222d] text-[#ffb0b8]"}`}
                  >
                    {item.isCorrect ? "Correta" : "Errada"}
                  </p>
                </div>

                <p className="mt-3 text-sm font-semibold text-white sm:text-base">{item.question.prompt}</p>

                <div className="mt-4 grid gap-2">
                  {item.question.options.map((option) => {
                    const isCorrectOption = item.question.correctAnswers.some(
                      (correctAnswer) =>
                        normalizeForComparison(correctAnswer) === normalizeForComparison(option.text)
                    );
                    const isSelected = item.selectedAnswers.some(
                      (selectedAnswer) =>
                        normalizeForComparison(selectedAnswer) === normalizeForComparison(option.text)
                    );

                    let optionClass = "border-white/10 bg-white/[0.03]";

                    if (isCorrectOption && isSelected) {
                      optionClass = "border-[#3f8a61] bg-[#1f4731]";
                    } else if (isCorrectOption) {
                      optionClass = "border-[#3f8a61] bg-[#183727]";
                    } else if (isSelected) {
                      optionClass = "border-[#9a3e4a] bg-[#4d1f29]";
                    }

                    return (
                      <div
                        key={option.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${optionClass}`}
                      >
                        <p className="text-xs text-[#edf3ff] sm:text-sm">
                          <span className="mr-2 font-semibold text-[#c6d7ff]">{option.label}.</span>
                          {option.text}
                        </p>
                        {isCorrectOption ? (
                          <span className="text-[11px] font-semibold uppercase text-[#9fe4b4]">Correta</span>
                        ) : isSelected ? (
                          <span className="text-[11px] font-semibold uppercase text-[#ffb0b8]">Escolhida</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
