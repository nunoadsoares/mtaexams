"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProfileSummary = {
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

function modeLabel(mode: string): string {
  if (mode === "wrong_only") {
    return "Só erradas";
  }
  if (mode === "unseen_only") {
    return "Não vistas";
  }
  return "Aleatório";
}

export function ProfileDashboard() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const progressToNextLevel = useMemo(() => {
    if (!profile) {
      return 0;
    }
    return Math.round((profile.gamification.currentLevelXp / profile.gamification.nextLevelXp) * 100);
  }, [profile]);

  const passRate = profile?.global.passRate ?? 0;
  const normalizedPassRate = Math.min(100, Math.max(0, passRate));
  const gaugeRadius = 82;
  const gaugeCircumference = Math.PI * gaugeRadius;
  const gaugeDashOffset = gaugeCircumference * (1 - normalizedPassRate / 100);

  const pointerAngle = -180 + normalizedPassRate * 1.8;
  const pointerRadians = (pointerAngle * Math.PI) / 180;
  const pointerLength = 56;
  const pointerX = 100 + pointerLength * Math.cos(pointerRadians);
  const pointerY = 116 + pointerLength * Math.sin(pointerRadians);

  const unlockedBadges = profile?.gamification.badges.filter((badge) => badge.unlocked).length ?? 0;
  const totalBadges = profile?.gamification.badges.length ?? 0;

  useEffect(() => {
    async function fetchProfile() {
      setIsLoading(true);
      setError("");

      const response = await fetch("/api/profile/summary");
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Não foi possível carregar o perfil.");
        setIsLoading(false);
        return;
      }

      setProfile({
        global: data.global,
        gamification: data.gamification,
        recentSessions: data.recentSessions,
      });
      setIsLoading(false);
    }

    void fetchProfile();
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,22,38,0.96),rgba(8,12,20,0.98))] px-6 py-8 shadow-[0_35px_90px_rgba(0,0,0,0.48)] sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#89a5d8]">Visão de Perfil</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              O teu progresso, sem ruído.
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-8 text-[#97abd0]">
              Sessões, nível, conquistas e desempenho real. Simples, claro e direto.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Voltar ao quiz
          </Link>
        </div>
      </section>

      {isLoading ? <p className="text-sm text-[#9db0d5]">A carregar perfil...</p> : null}
      {error ? <p className="rounded-2xl bg-[#31161d] px-4 py-3 text-sm text-[#ffadb6]">{error}</p> : null}

      {profile ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Sessões</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
                {profile.global.totalSessions}
              </p>
            </article>
            <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Taxa de aprovação</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#b6cbff]">
                {profile.global.passRate}%
              </p>
            </article>
            <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Precisão global</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#9de1b2]">
                {profile.global.accuracy}%
              </p>
            </article>
            <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Classe</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                {profile.global.knowledgeRank}
              </p>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <article className="rounded-[30px] border border-[#20345b] bg-[linear-gradient(180deg,rgba(18,28,47,0.96),rgba(11,16,28,0.98))] p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Velocímetro de aprovação</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr] sm:items-center">
                <div className="relative">
                  <svg viewBox="0 0 200 130" className="h-40 w-full max-w-[220px]">
                    <path
                      d="M18 116 A82 82 0 0 1 182 116"
                      fill="none"
                      stroke="#243451"
                      strokeWidth="14"
                      strokeLinecap="round"
                    />
                    <path
                      d="M18 116 A82 82 0 0 1 182 116"
                      fill="none"
                      stroke="#9cbcff"
                      strokeWidth="14"
                      strokeLinecap="round"
                      strokeDasharray={gaugeCircumference}
                      strokeDashoffset={gaugeDashOffset}
                    />
                    <line
                      x1="100"
                      y1="116"
                      x2={pointerX}
                      y2={pointerY}
                      stroke="#dbe6ff"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="116" r="6" fill="#dbe6ff" />
                  </svg>
                  <div className="absolute left-0 top-[114px] text-[11px] text-[#86a1d1]">0</div>
                  <div className="absolute right-0 top-[114px] text-[11px] text-[#86a1d1]">100</div>
                  <div className="absolute inset-x-0 top-[72px] text-center">
                    <p className="text-3xl font-semibold text-white">{profile.global.passRate}%</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-[#9fb3d8]">
                    Percentagem de testes em que passaste (meta: 70%).
                  </p>
                  <div className="mt-4 grid gap-2 text-sm">
                    <p className="rounded-xl border border-[#254d38] bg-[#13291f] px-3 py-2 text-[#9fe4b4]">
                      Aprovados: {profile.global.passedSessions}
                    </p>
                    <p className="rounded-xl border border-[#5d2a35] bg-[#2d161d] px-3 py-2 text-[#ffb0b8]">
                      Chumbados: {profile.global.failedSessions}
                    </p>
                    <p className="rounded-xl border border-[#27426e] bg-[#101a2f] px-3 py-2 text-[#c6d7ff]">
                      Série atual: {profile.gamification.currentStreak} aprovação(ões)
                    </p>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Gamificação</p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-5xl font-semibold tracking-[-0.05em] text-white">
                    {profile.gamification.level}
                  </p>
                  <p className="mt-2 text-sm text-[#9fb3d8]">{profile.gamification.totalXp} XP total</p>
                </div>
                <p className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#d8e4ff]">
                  {profile.gamification.currentLevelXp}/{profile.gamification.nextLevelXp}
                </p>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#22304f]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#c7d7ff_0%,#8cb0ff_100%)] transition-all duration-500"
                  style={{ width: `${progressToNextLevel}%` }}
                />
              </div>

              <div className="mt-6 rounded-2xl border border-[#223b66] bg-[#0f182d] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#93addd]">Conquistas</p>
                <p className="mt-2 text-sm text-[#d5e3ff]">
                  {unlockedBadges}/{totalBadges} desbloqueadas
                </p>
                <div className="mt-3 grid gap-2">
                  {profile.gamification.badges.slice(0, 4).map((badge) => (
                    <div
                      key={badge.id}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        badge.unlocked
                          ? "border-[#356a4d] bg-[#183524] text-[#9fe4b4]"
                          : "border-white/10 bg-white/[0.03] text-[#9fb3d8]"
                      }`}
                    >
                      <p className="font-semibold">{badge.unlocked ? `Concluída: ${badge.title}` : badge.title}</p>
                      <p className="mt-1 text-xs opacity-90">{badge.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Últimas sessões</p>
            <div className="mt-4 grid gap-3">
              {profile.recentSessions.length ? (
                profile.recentSessions.slice(0, 6).map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-[#0d1422] px-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {session.score}/{session.totalQuestions} no modo {modeLabel(session.mode)}
                      </p>
                      <p className="mt-1 text-sm text-[#9fb3d8]">Precisão {session.accuracy}%</p>
                    </div>
                    <p
                      className={`rounded-full px-3 py-1 text-xs font-semibold tracking-[0.14em] ${
                        session.passed ? "bg-[#183121] text-[#9fe4b4]" : "bg-[#3a1820] text-[#ffacb4]"
                      }`}
                    >
                      {session.passed ? "APROVADO" : "CHUMBADO"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#9fb3d8]">Ainda não há sessões concluídas.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
