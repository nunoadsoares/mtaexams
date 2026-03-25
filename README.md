# MTA Quiz Local

App local-first para estudo com:

- Importacao de perguntas a partir de PDF.
- Quiz em varios modos (aleatorio, erradas, nunca vistas).
- Estatisticas de desempenho e perguntas mais falhadas.
- Persistencia local com SQLite.

## Stack

- Next.js + TypeScript
- Tailwind CSS
- Prisma ORM
- SQLite
- Zod para validacao de estrutura das perguntas

## Estrutura principal

- API de importacao PDF: `src/app/api/import/route.ts`
- API de iniciar quiz: `src/app/api/quiz/start/route.ts`
- API de submissao de quiz: `src/app/api/quiz/[sessionId]/submit/route.ts`
- API de estatisticas: `src/app/api/stats/overview/route.ts`
- Parser PDF: `src/lib/importers/pdf.ts`
- Schema Prisma: `prisma/schema.prisma`

## Como correr

1. Instalar dependencias

```bash
npm install
```

2. Criar/atualizar base de dados local

```bash
npm run db:push
```

3. Correr app

```bash
npm run dev
```

4. Abrir no browser

```text
http://localhost:3000
```

## Notas sobre PDF

- O endpoint de importacao tenta encontrar automaticamente o primeiro ficheiro PDF na pasta pai do projeto (`../`).
- Como o teu PDF esta em `MTAQUIZZ`, funciona se correres a app a partir de `MTAQUIZZ/quiz-app`.
- Se precisares, podes adaptar o endpoint para receber um caminho explicito no body (`sourcePath`).

## Scripts uteis

```bash
npm run lint
npm run build
npm run db:push
npm run db:studio
```
