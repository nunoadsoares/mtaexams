import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { NormalizedQuestion } from "@/lib/questions/schema";

const PASS_THRESHOLD = 70;

type StoredDocument = {
  id: string;
  title: string;
  filePath: string;
  fileType: string;
  importedAt: string;
  rawText?: string;
};

type StoredQuestionOption = {
  id: string;
  label: string;
  text: string;
  sortOrder: number;
};

type StoredQuestionStats = {
  timesSeen: number;
  timesCorrect: number;
  timesWrong: number;
  lastSeenAt: string | null;
};

export type StoredQuestion = {
  id: string;
  documentId?: string;
  prompt: string;
  explanation?: string;
  topic: string;
  difficulty: string;
  questionType: string;
  correctAnswer: string;
  correctAnswers: string[];
  sourceHash: string;
  createdAt: string;
  updatedAt: string;
  options: StoredQuestionOption[];
  stats: StoredQuestionStats;
};

type StoredQuizSession = {
  id: string;
  mode: string;
  topicFilter?: string;
  score: number;
  totalQuestions: number;
  startedAt: string;
  endedAt: string | null;
};

type StoredQuizAnswer = {
  id: string;
  sessionId: string;
  questionId: string;
  selectedAnswers: string[];
  isCorrect: boolean;
  responseTimeMs?: number;
  answeredAt: string;
};

type StoreData = {
  documents: StoredDocument[];
  questions: StoredQuestion[];
  sessions: StoredQuizSession[];
  answers: StoredQuizAnswer[];
};

type LegacyStoredQuestion = Omit<StoredQuestion, "correctAnswers"> & {
  correctAnswers?: string[];
};

type LegacyStoredQuizAnswer = Omit<StoredQuizAnswer, "selectedAnswers"> & {
  selectedAnswer?: string;
  selectedAnswers?: string[];
};

type ImportPayload = {
  filePath: string;
  title: string;
  rawText: string;
  parsedQuestions: NormalizedQuestion[];
};

type StartQuizPayload = {
  mode: "random" | "wrong_only" | "unseen_only";
  topic?: string;
  limit: number;
};

type SubmitAnswerPayload = {
  questionId: string;
  selectedAnswers: string[];
  responseTimeMs?: number;
};

const EMPTY_STORE: StoreData = {
  documents: [],
  questions: [],
  sessions: [],
  answers: [],
};

let mutationQueue: Promise<unknown> = Promise.resolve();

function findProjectRoot(startDir: string): string {
  let currentDir = startDir;

  for (let i = 0; i < 8; i += 1) {
    const packageJsonPath = path.resolve(currentDir, "package.json");
    if (fsSync.existsSync(packageJsonPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return startDir;
}

function getStorePath(): string {
  const explicitStorePath = process.env.QUIZ_STORE_PATH?.trim();
  if (explicitStorePath) {
    return path.resolve(explicitStorePath);
  }

  if (process.env.VERCEL === "1") {
    return path.join("/tmp", "quiz-store.json");
  }

  const rootDir = findProjectRoot(process.cwd());
  return path.join(rootDir, "data", "quiz-store.json");
}

async function ensureStoreFile(): Promise<string> {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });

  try {
    await fs.access(storePath);
  } catch {
    const rootDir = findProjectRoot(process.cwd());
    const seedStorePath = path.join(rootDir, "data", "quiz-store.json");

    if (path.resolve(seedStorePath) !== path.resolve(storePath)) {
      try {
        const seeded = await fs.readFile(seedStorePath, "utf8");
        await fs.writeFile(storePath, seeded, "utf8");
        return storePath;
      } catch {
        // If no seed exists, fall through and create an empty store.
      }
    }

    await fs.writeFile(storePath, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
  }

  return storePath;
}

async function readStore(): Promise<StoreData> {
  const storePath = await ensureStoreFile();
  const raw = await fs.readFile(storePath, "utf8");
  const parsed = JSON.parse(raw) as Omit<Partial<StoreData>, "questions" | "answers"> & {
    questions?: LegacyStoredQuestion[];
    answers?: LegacyStoredQuizAnswer[];
  };

  return {
    documents: parsed.documents ?? [],
    questions: (parsed.questions ?? []).map(normalizeStoredQuestion),
    sessions: parsed.sessions ?? [],
    answers: (parsed.answers ?? []).map((answer) => ({
      ...answer,
      selectedAnswers:
        answer.selectedAnswers && answer.selectedAnswers.length > 0
          ? answer.selectedAnswers
          : answer.selectedAnswer
            ? [answer.selectedAnswer]
            : [],
    })),
  };
}

async function writeStore(data: StoreData): Promise<void> {
  const storePath = await ensureStoreFile();
  await fs.writeFile(storePath, JSON.stringify(data, null, 2), "utf8");
}

async function mutateStore<T>(mutator: (data: StoreData) => Promise<T> | T): Promise<T> {
  const task = mutationQueue.then(async () => {
    const data = await readStore();
    const result = await mutator(data);
    await writeStore(data);
    return result;
  });

  mutationQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

function createId(): string {
  return crypto.randomUUID();
}

function normalizeForComparison(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function shuffleInPlace<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function computeAccuracy(correct: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Number(((correct / total) * 100).toFixed(1));
}

function normalizeAnswerSet(values: string[]): string[] {
  return values
    .map((value) => normalizeForComparison(value))
    .filter(Boolean)
    .sort();
}

function extractAnswerLabels(rawAnswer: string): string[] {
  return Array.from(new Set((rawAnswer.toUpperCase().match(/[A-H]/g) ?? [])));
}

function normalizeStoredQuestion(question: LegacyStoredQuestion): StoredQuestion {
  const answerMarkerRegex =
    /(?:^|\b)(?:common\s+)?(?:correct\s+)?(?:answer|answers|resposta)\s*[:\-]\s*([A-H,\s/]+)\b/i;

  const embeddedLabels = new Set<string>();
  const normalizedOptions = (question.options ?? [])
    .map((option) => {
      const markerMatch = option.text.match(answerMarkerRegex);
      if (markerMatch) {
        for (const label of extractAnswerLabels(markerMatch[1])) {
          embeddedLabels.add(label);
        }
      }

      const cleanedText = option.text
        .replace(answerMarkerRegex, "")
        .replace(/\s+/g, " ")
        .trim();

      return {
        ...option,
        text: cleanedText,
      };
    })
    .filter((option) => option.text.length > 0)
    .map((option, index) => ({
      ...option,
      sortOrder: index,
    }));

  const storedCorrectAnswers =
    question.correctAnswers && question.correctAnswers.length > 0
      ? question.correctAnswers
      : question.correctAnswer
        ? [question.correctAnswer]
        : [];

  let correctAnswers = storedCorrectAnswers;

  if (embeddedLabels.size > 0) {
    const inferredCorrectAnswers = normalizedOptions
      .filter((option) => embeddedLabels.has(option.label.toUpperCase()))
      .map((option) => option.text);

    if (inferredCorrectAnswers.length > 0) {
      correctAnswers = inferredCorrectAnswers;
    }
  }

  const finalCorrectAnswers =
    correctAnswers.length > 0
      ? correctAnswers
      : normalizedOptions.length > 0
        ? [normalizedOptions[0].text]
        : [];

  return {
    ...question,
    options: normalizedOptions,
    correctAnswers: finalCorrectAnswers,
    correctAnswer: finalCorrectAnswers[0] ?? "",
    questionType: finalCorrectAnswers.length > 1 ? "multiple_select" : "multiple_choice",
  };
}

function getKnowledgeRank(accuracy: number): string {
  if (accuracy >= 90) {
    return "Mestre do Quiz";
  }
  if (accuracy >= 80) {
    return "Conhecimento Pro";
  }
  if (accuracy >= 70) {
    return "Aprendiz em Ascensão";
  }
  return "Precisa de Reforço";
}

export async function getAllQuestions(): Promise<StoredQuestion[]> {
  const data = await readStore();
  return data.questions;
}

export async function importParsedQuestions(payload: ImportPayload) {
  return mutateStore(async (data) => {
    const now = new Date().toISOString();
    const existingDocument = data.documents.find((document) => document.filePath === payload.filePath);

    const document: StoredDocument =
      existingDocument ?? {
        id: createId(),
        title: payload.title,
        filePath: payload.filePath,
        fileType: "pdf",
        importedAt: now,
      };

    document.title = payload.title;
    document.rawText = payload.rawText;

    if (!existingDocument) {
      data.documents.push(document);
    }

    let created = 0;
    let updated = 0;

    for (const question of payload.parsedQuestions) {
      const sourceHash = crypto
        .createHash("sha256")
        .update(`${question.prompt}::${question.options.map((option) => option.text).join("|")}`)
        .digest("hex");

      const existingQuestion =
        data.questions.find((entry) => entry.sourceHash === sourceHash) ??
        data.questions.find(
          (entry) =>
            entry.documentId === document.id &&
            normalizeForComparison(entry.prompt) === normalizeForComparison(question.prompt)
        );
      if (existingQuestion) {
        existingQuestion.prompt = question.prompt;
        existingQuestion.explanation = question.explanation;
        existingQuestion.topic = question.topic;
        existingQuestion.difficulty = question.difficulty;
        existingQuestion.questionType = question.questionType;
        existingQuestion.correctAnswer = question.correctAnswer;
        existingQuestion.correctAnswers = question.correctAnswers;
        existingQuestion.sourceHash = sourceHash;
        existingQuestion.updatedAt = now;
        existingQuestion.documentId = document.id;
        existingQuestion.options = question.options.map((option) => ({
          id: `${existingQuestion.id}-${option.label}`,
          label: option.label,
          text: option.text,
          sortOrder: option.sortOrder,
        }));
        updated += 1;
        continue;
      }

      const questionId = createId();
      data.questions.push({
        id: questionId,
        documentId: document.id,
        prompt: question.prompt,
        explanation: question.explanation,
        topic: question.topic,
        difficulty: question.difficulty,
        questionType: question.questionType,
        correctAnswer: question.correctAnswer,
        correctAnswers: question.correctAnswers,
        sourceHash,
        createdAt: now,
        updatedAt: now,
        options: question.options.map((option) => ({
          id: createId(),
          label: option.label,
          text: option.text,
          sortOrder: option.sortOrder,
        })),
        stats: {
          timesSeen: 0,
          timesCorrect: 0,
          timesWrong: 0,
          lastSeenAt: null,
        },
      });
      created += 1;
    }

    return {
      ok: true as const,
      document: {
        id: document.id,
        title: document.title,
        filePath: document.filePath,
      },
      importedCount: created,
      updatedCount: updated,
      totalParsed: payload.parsedQuestions.length,
    };
  });
}

export async function hasImportedDocument(filePath: string): Promise<boolean> {
  const data = await readStore();
  const document = data.documents.find((entry) => entry.filePath === filePath);
  if (!document) {
    return false;
  }

  return data.questions.some((question) => question.documentId === document.id);
}

export async function startQuizSession(payload: StartQuizPayload) {
  return mutateStore(async (data) => {
    const scopedQuestions = payload.topic
      ? data.questions.filter((question) => question.topic === payload.topic)
      : data.questions;

    let filtered = scopedQuestions;

    if (payload.mode === "wrong_only") {
      filtered = scopedQuestions.filter((question) => question.stats.timesWrong > 0);
    }

    if (payload.mode === "unseen_only") {
      filtered = scopedQuestions.filter((question) => question.stats.timesSeen === 0);
    }

    if (filtered.length === 0) {
      throw new Error("Nenhuma pergunta disponivel para o modo selecionado.");
    }

    const selected = shuffleInPlace(filtered).slice(0, payload.limit);
    const session = {
      id: createId(),
      mode: payload.mode,
      topicFilter: payload.topic,
      score: 0,
      totalQuestions: selected.length,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };

    data.sessions.push(session);

    return {
      sessionId: session.id,
      questions: selected.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        topic: question.topic,
        difficulty: question.difficulty,
        correctAnswer: question.correctAnswer,
        correctAnswers: question.correctAnswers,
        questionType: question.questionType,
        explanation: question.explanation,
        options: [...question.options].sort((a, b) => a.sortOrder - b.sortOrder),
      })),
    };
  });
}

export async function submitQuizSession(sessionId: string, answers: SubmitAnswerPayload[]) {
  return mutateStore(async (data) => {
    const session = data.sessions.find((entry) => entry.id === sessionId);
    if (!session) {
      throw new Error("Sessao nao encontrada.");
    }

    if (answers.length === 0) {
      throw new Error("Sem respostas para submeter.");
    }

    const topicSummaryMap = new Map<string, { topic: string; total: number; correct: number; wrong: number }>();
    let score = 0;

    for (const answer of answers) {
      const question = data.questions.find((entry) => entry.id === answer.questionId);
      if (!question) {
        continue;
      }

      const isCorrect =
        JSON.stringify(normalizeAnswerSet(question.correctAnswers)) ===
        JSON.stringify(normalizeAnswerSet(answer.selectedAnswers));

      if (isCorrect) {
        score += 1;
      }

      data.answers.push({
        id: createId(),
        sessionId,
        questionId: question.id,
        selectedAnswers: answer.selectedAnswers,
        isCorrect,
        responseTimeMs: answer.responseTimeMs,
        answeredAt: new Date().toISOString(),
      });

      question.stats.timesSeen += 1;
      question.stats.timesCorrect += isCorrect ? 1 : 0;
      question.stats.timesWrong += isCorrect ? 0 : 1;
      question.stats.lastSeenAt = new Date().toISOString();
      question.updatedAt = new Date().toISOString();

      const currentTopic = topicSummaryMap.get(question.topic) ?? {
        topic: question.topic,
        total: 0,
        correct: 0,
        wrong: 0,
      };

      currentTopic.total += 1;
      currentTopic.correct += isCorrect ? 1 : 0;
      currentTopic.wrong += isCorrect ? 0 : 1;
      topicSummaryMap.set(question.topic, currentTopic);
    }

    session.score = score;
    session.endedAt = new Date().toISOString();

    const total = answers.length;
    const accuracy = computeAccuracy(score, total);
    const wrongAnswers = total - score;
    const passed = accuracy >= PASS_THRESHOLD;
    const xpEarned = score * 10 + (passed ? 50 : 0) + (accuracy === 100 ? 40 : 0);

    return {
      ok: true,
      score,
      total,
      accuracy,
      correctAnswers: score,
      wrongAnswers,
      passed,
      passThreshold: PASS_THRESHOLD,
      xpEarned,
      knowledgeRank: getKnowledgeRank(accuracy),
      categoryBreakdown: Array.from(topicSummaryMap.values())
        .map((entry) => ({
          ...entry,
          accuracy: computeAccuracy(entry.correct, entry.total),
        }))
        .sort((a, b) => b.accuracy - a.accuracy),
      sessionMessage: passed
        ? "Parabéns! Passaste esta sessão."
        : "Ainda não passaste. Vamos rever os erros e tentar outra vez.",
    };
  });
}

export async function getOverviewStats() {
  const data = await readStore();

  const totalQuestions = data.questions.length;
  const totalSessions = data.sessions.length;
  const totalAnswers = data.answers.length;
  const correctAnswers = data.answers.filter((answer) => answer.isCorrect).length;
  const accuracy = computeAccuracy(correctAnswers, totalAnswers);

  const completedSessions = data.sessions
    .filter((session) => session.endedAt)
    .map((session) => {
      const sessionAccuracy = computeAccuracy(session.score, session.totalQuestions);
      return {
        ...session,
        accuracy: sessionAccuracy,
        passed: sessionAccuracy >= PASS_THRESHOLD,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const passedSessions = completedSessions.filter((session) => session.passed).length;
  const failedSessions = completedSessions.length - passedSessions;
  const passRate = computeAccuracy(passedSessions, completedSessions.length);
  const averageSessionAccuracy =
    completedSessions.length === 0
      ? 0
      : Number(
          (
            completedSessions.reduce((sum, session) => sum + session.accuracy, 0) /
            completedSessions.length
          ).toFixed(1)
        );
  const bestSessionAccuracy = completedSessions.reduce(
    (best, session) => (session.accuracy > best ? session.accuracy : best),
    0
  );

  let recentPassStreak = 0;
  for (const session of completedSessions) {
    if (!session.passed) {
      break;
    }
    recentPassStreak += 1;
  }

  const topicStatsMap = new Map<
    string,
    { id: string; topic: string; timesSeen: number; timesCorrect: number; timesWrong: number }
  >();

  for (const question of data.questions) {
    const topicEntry = topicStatsMap.get(question.topic) ?? {
      id: question.topic,
      topic: question.topic,
      timesSeen: 0,
      timesCorrect: 0,
      timesWrong: 0,
    };

    topicEntry.timesSeen += question.stats.timesSeen;
    topicEntry.timesCorrect += question.stats.timesCorrect;
    topicEntry.timesWrong += question.stats.timesWrong;
    topicStatsMap.set(question.topic, topicEntry);
  }

  const topicStats = Array.from(topicStatsMap.values()).map((topic) => ({
    ...topic,
    accuracy: computeAccuracy(topic.timesCorrect, topic.timesSeen),
  }));

  const weakestTopics = topicStats
    .filter((topic) => topic.timesSeen > 0)
    .sort((a, b) => b.timesWrong - a.timesWrong || b.timesSeen - a.timesSeen)
    .slice(0, 6);

  const strongestTopics = topicStats
    .filter((topic) => topic.timesSeen > 0)
    .sort((a, b) => b.timesCorrect - a.timesCorrect || b.timesSeen - a.timesSeen)
    .slice(0, 6);

  const mostMissedQuestions = data.questions
    .filter((question) => question.stats.timesWrong > 0)
    .sort(
      (a, b) => b.stats.timesWrong - a.stats.timesWrong || b.stats.timesSeen - a.stats.timesSeen
    )
    .slice(0, 8)
    .map((question) => ({
      id: question.id,
      timesSeen: question.stats.timesSeen,
      timesCorrect: question.stats.timesCorrect,
      timesWrong: question.stats.timesWrong,
      question: {
        id: question.id,
        prompt: question.prompt,
        topic: question.topic,
      },
    }));

  return {
    totalQuestions,
    totalSessions,
    completedSessions: completedSessions.length,
    totalAnswers,
    correctAnswers,
    accuracy,
    passThreshold: PASS_THRESHOLD,
    passedSessions,
    failedSessions,
    passRate,
    averageSessionAccuracy,
    bestSessionAccuracy,
    recentPassStreak,
    weakestTopics,
    strongestTopics,
    mostMissedQuestions,
  };
}

export async function getProfileSummary() {
  const data = await readStore();
  const overview = await getOverviewStats();

  const sessions = data.sessions
    .filter((session) => session.endedAt)
    .map((session) => {
      const accuracy = computeAccuracy(session.score, session.totalQuestions);
      const passed = accuracy >= PASS_THRESHOLD;
      const xp = session.score * 10 + (passed ? 50 : 0) + (accuracy === 100 ? 40 : 0);
      return {
        ...session,
        accuracy,
        passed,
        xp,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const totalXp = sessions.reduce((sum, session) => sum + session.xp, 0);
  const level = Math.floor(totalXp / 400) + 1;
  const currentLevelXp = totalXp % 400;
  const nextLevelXp = 400;

  const topicStatsMap = new Map<string, { id: string; topic: string; timesSeen: number; timesCorrect: number; timesWrong: number }>();
  for (const question of data.questions) {
    const topicEntry = topicStatsMap.get(question.topic) ?? {
      id: question.topic,
      topic: question.topic,
      timesSeen: 0,
      timesCorrect: 0,
      timesWrong: 0,
    };

    topicEntry.timesSeen += question.stats.timesSeen;
    topicEntry.timesCorrect += question.stats.timesCorrect;
    topicEntry.timesWrong += question.stats.timesWrong;
    topicStatsMap.set(question.topic, topicEntry);
  }

  const categoryMastery = Array.from(topicStatsMap.values()).map((topic) => {
    const topicAccuracy = computeAccuracy(topic.timesCorrect, topic.timesSeen);
    const masteryLabel =
      topicAccuracy >= 85
        ? "Dominada"
        : topicAccuracy >= 70
          ? "Sólida"
          : topicAccuracy >= 50
            ? "A Evoluir"
            : "Precisa de Reforço";

    return {
      ...topic,
      accuracy: topicAccuracy,
      masteryLabel,
    };
  });

  return {
    passThreshold: PASS_THRESHOLD,
    global: {
      totalSessions: sessions.length,
      passedSessions: overview.passedSessions,
      failedSessions: overview.failedSessions,
      passRate: overview.passRate,
      totalAnswers: overview.totalAnswers,
      correctAnswers: overview.correctAnswers,
      wrongAnswers: overview.totalAnswers - overview.correctAnswers,
      accuracy: overview.accuracy,
      knowledgeRank: getKnowledgeRank(overview.accuracy),
    },
    gamification: {
      totalXp,
      level,
      currentLevelXp,
      nextLevelXp,
      currentStreak: overview.recentPassStreak,
      badges: [
        {
          id: "first_session",
          title: "Primeira Volta",
          description: "Completa 1 sessão.",
          unlocked: sessions.length >= 1,
        },
        {
          id: "consistent",
          title: "Ritmo Consistente",
          description: "Completa 10 sessões.",
          unlocked: sessions.length >= 10,
        },
        {
          id: "pass_master",
          title: "Mestre da Aprovação",
          description: "Taxa de aprovação global acima de 70%.",
          unlocked: overview.passRate >= 70,
        },
        {
          id: "accuracy_elite",
          title: "Precisão de Elite",
          description: "Taxa de acerto global acima de 85%.",
          unlocked: overview.accuracy >= 85,
        },
        {
          id: "category_ninja",
          title: "Ninja das Categorias",
          description: "Ter pelo menos 3 categorias com nível Dominada.",
          unlocked: categoryMastery.filter((category) => category.masteryLabel === "Dominada").length >= 3,
        },
      ],
    },
    categoryMastery,
    recentSessions: sessions.slice(0, 12),
  };
}
