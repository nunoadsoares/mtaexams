# MTA Quiz App

App de estudo interativa com quiz, feedback imediato, estatisticas por sessao e perfil global.

## Stack

- Next.js + TypeScript
- Tailwind CSS
- Store local em JSON (`data/quiz-store.json`)
- Parser de PDF para importar perguntas

## Correr localmente

1. Instalar dependencias

```bash
npm install
```

2. Iniciar em dev

```bash
npm run dev
```

3. Abrir no browser

```text
http://localhost:3000
```

## Deploy rapido (Vercel - gratuito)

1. Ir a `https://vercel.com/new`
2. Importar o repo `nunoadsoares/mtaexams`
3. Framework: `Next.js` (detetado automaticamente)
4. Clicar em `Deploy`

URL final fica no dominio da Vercel, por exemplo:
`https://mtaexams.vercel.app`

## Nota sobre persistencia na Vercel

- A app usa store em ficheiro local.
- Em Vercel, o ficheiro corre em `/tmp`, por isso os dados podem resetar entre cold starts/deploys.
- Para persistencia total em producao, o passo seguinte e ligar um storage externo (KV/Postgres).

## Scripts uteis

```bash
npm run lint
npm run build
```
