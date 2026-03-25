"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProfileSummary = {
  global: {
    totalSessions: number;
    passRate: number;
    accuracy: number;
    knowledgeRank: string;
  };
  gamification: {
    totalXp: number;
    level: number;
    currentLevelXp: number;
    nextLevelXp: number;
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

  useEffect(() => {
    async function fetchProfile() {
      setIsLoading(true);
      setError("");

      const response = await fetch("/api/profile/summary");
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Nao foi possivel carregar o perfil.");
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
            <p className="text-xs uppercase tracking-[0.28em] text-[#89a5d8]">Profile Overview</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              O teu progresso numa vista limpa.
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-8 text-[#97abd0]">
              Sessões, nível e desempenho recente. Só o que interessa.
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
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Sessoes</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
                {profile.global.totalSessions}
              </p>
            </article>
            <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Pass rate</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#b6cbff]">
                {profile.global.passRate}%
              </p>
            </article>
            <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Accuracy</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#9de1b2]">
                {profile.global.accuracy}%
              </p>
            </article>
            <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Rank</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                {profile.global.knowledgeRank}
              </p>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-[30px] border border-[#20345b] bg-[linear-gradient(180deg,rgba(18,28,47,0.96),rgba(11,16,28,0.98))] p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Level Progress</p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-5xl font-semibold tracking-[-0.05em] text-white">
                    {profile.gamification.level}
                  </p>
                  <p className="mt-2 text-sm text-[#9fb3d8]">
                    {profile.gamification.totalXp} XP total
                  </p>
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
            </article>

            <article className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7f98c7]">Ultimas sessoes</p>
              <div className="mt-4 grid gap-3">
                {profile.recentSessions.length ? (
                  profile.recentSessions.slice(0, 4).map((session) => (
                    <div
                      key={session.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-[#0d1422] px-4 py-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {session.score}/{session.totalQuestions} no modo {session.mode}
                        </p>
                        <p className="mt-1 text-sm text-[#9fb3d8]">Accuracy {session.accuracy}%</p>
                      </div>
                      <p
                        className={`rounded-full px-3 py-1 text-xs font-semibold tracking-[0.18em] ${
                          session.passed
                            ? "bg-[#183121] text-[#9fe4b4]"
                            : "bg-[#3a1820] text-[#ffacb4]"
                        }`}
                      >
                        {session.passed ? "PASSOU" : "REPROVOU"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#9fb3d8]">Ainda sem sessoes concluidas.</p>
                )}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
