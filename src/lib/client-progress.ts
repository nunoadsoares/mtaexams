const STORAGE_KEY = "mta_quiz_progress_v1";
const PASS_THRESHOLD = 70;

type LocalSession = {
  id: string;
  mode: string;
  score: number;
  totalQuestions: number;
  accuracy: number;
  passed: boolean;
  passThreshold: number;
  completedAt: string;
};

type LocalProgressStore = {
  version: 1;
  sessions: LocalSession[];
};

export type LocalOverviewStats = {
  completedSessions: number;
  passRate: number;
  accuracy: number;
};

export type LocalProfileSummary = {
  global: {
    totalSessions: number;
    passedSessions: number;
    failedSessions: number;
    passRate: number;
    accuracy: number;
    knowledgeRank: string;
  };
  gamification: {
    totalXp: number;
    level: number;
    currentLevelXp: number;
    nextLevelXp: number;
    currentStreak: number;
    badges: Array<{
      id: string;
      title: string;
      description: string;
      unlocked: boolean;
    }>;
  };
  recentSessions: Array<{
    id: string;
    mode: string;
    score: number;
    totalQuestions: number;
    accuracy: number;
    passed: boolean;
  }>;
};

const EMPTY_STORE: LocalProgressStore = {
  version: 1,
  sessions: [],
};

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function computeAccuracy(correct: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Number(((correct / total) * 100).toFixed(1));
}

function getKnowledgeRank(accuracy: number): string {
  if (accuracy >= 90) {
    return "Mestre do Quiz";
  }
  if (accuracy >= 80) {
    return "Conhecimento Pro";
  }
  if (accuracy >= 70) {
    return "Aprendiz em Ascensao";
  }
  return "Precisa de Reforco";
}

function parseStore(raw: string | null): LocalProgressStore {
  if (!raw) {
    return EMPTY_STORE;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProgressStore>;
    if (!Array.isArray(parsed.sessions)) {
      return EMPTY_STORE;
    }

    return {
      version: 1,
      sessions: parsed.sessions
        .filter((session) => session && typeof session === "object")
        .map((session) => ({
          id: typeof session.id === "string" ? session.id : crypto.randomUUID(),
          mode: typeof session.mode === "string" ? session.mode : "random",
          score: Number(session.score ?? 0),
          totalQuestions: Number(session.totalQuestions ?? 0),
          accuracy: Number(session.accuracy ?? 0),
          passed: Boolean(session.passed),
          passThreshold:
            typeof session.passThreshold === "number" ? session.passThreshold : PASS_THRESHOLD,
          completedAt:
            typeof session.completedAt === "string" ? session.completedAt : new Date().toISOString(),
        })),
    };
  } catch {
    return EMPTY_STORE;
  }
}

function readStore(): LocalProgressStore {
  if (!hasBrowserStorage()) {
    return EMPTY_STORE;
  }

  return parseStore(window.localStorage.getItem(STORAGE_KEY));
}

function writeStore(store: LocalProgressStore): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function saveLocalSession(payload: {
  mode: string;
  score: number;
  totalQuestions: number;
  accuracy: number;
  passed: boolean;
  passThreshold?: number;
}): void {
  const store = readStore();

  store.sessions.push({
    id: crypto.randomUUID(),
    mode: payload.mode,
    score: payload.score,
    totalQuestions: payload.totalQuestions,
    accuracy: payload.accuracy,
    passed: payload.passed,
    passThreshold: payload.passThreshold ?? PASS_THRESHOLD,
    completedAt: new Date().toISOString(),
  });

  store.sessions = store.sessions
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 500);

  writeStore(store);
}

export function getLocalOverviewStats(): LocalOverviewStats {
  const sessions = readStore().sessions;
  const completedSessions = sessions.length;
  const passedSessions = sessions.filter((session) => session.passed).length;
  const totalAnswers = sessions.reduce((sum, session) => sum + session.totalQuestions, 0);
  const correctAnswers = sessions.reduce((sum, session) => sum + session.score, 0);

  return {
    completedSessions,
    passRate: computeAccuracy(passedSessions, completedSessions),
    accuracy: computeAccuracy(correctAnswers, totalAnswers),
  };
}

export function getLocalProfileSummary(): LocalProfileSummary {
  const sessions = readStore().sessions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const totalSessions = sessions.length;
  const passedSessions = sessions.filter((session) => session.passed).length;
  const failedSessions = totalSessions - passedSessions;
  const totalAnswers = sessions.reduce((sum, session) => sum + session.totalQuestions, 0);
  const correctAnswers = sessions.reduce((sum, session) => sum + session.score, 0);

  const passRate = computeAccuracy(passedSessions, totalSessions);
  const accuracy = computeAccuracy(correctAnswers, totalAnswers);

  let currentStreak = 0;
  for (const session of sessions) {
    if (!session.passed) {
      break;
    }
    currentStreak += 1;
  }

  const totalXp = sessions.reduce((sum, session) => {
    const sessionXp = session.score * 10 + (session.passed ? 50 : 0) + (session.accuracy === 100 ? 40 : 0);
    return sum + sessionXp;
  }, 0);

  const level = Math.floor(totalXp / 400) + 1;
  const currentLevelXp = totalXp % 400;
  const nextLevelXp = 400;

  const badges = [
    {
      id: "first_session",
      title: "Primeira Volta",
      description: "Completa 1 sessao.",
      unlocked: totalSessions >= 1,
    },
    {
      id: "consistent",
      title: "Ritmo Consistente",
      description: "Completa 10 sessoes.",
      unlocked: totalSessions >= 10,
    },
    {
      id: "pass_master",
      title: "Mestre da Aprovacao",
      description: "Taxa de aprovacao global acima de 70%.",
      unlocked: passRate >= 70,
    },
    {
      id: "accuracy_elite",
      title: "Precisao de Elite",
      description: "Taxa de acerto global acima de 85%.",
      unlocked: accuracy >= 85,
    },
    {
      id: "streak_runner",
      title: "Sequencia Imparavel",
      description: "Ter uma serie de 3 aprovacoes seguidas.",
      unlocked: currentStreak >= 3,
    },
  ];

  return {
    global: {
      totalSessions,
      passedSessions,
      failedSessions,
      passRate,
      accuracy,
      knowledgeRank: getKnowledgeRank(accuracy),
    },
    gamification: {
      totalXp,
      level,
      currentLevelXp,
      nextLevelXp,
      currentStreak,
      badges,
    },
    recentSessions: sessions.slice(0, 12).map((session) => ({
      id: session.id,
      mode: session.mode,
      score: session.score,
      totalQuestions: session.totalQuestions,
      accuracy: session.accuracy,
      passed: session.passed,
    })),
  };
}
