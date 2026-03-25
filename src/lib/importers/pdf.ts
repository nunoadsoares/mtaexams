import fs from "node:fs/promises";
import path from "node:path";
import { normalizedQuestionsSchema, type NormalizedQuestion } from "@/lib/questions/schema";

type QuestionBuilder = {
  number: number;
  prompt: string;
  answerHint: string | null;
  options: Array<{ label: string; text: string; sortOrder: number }>;
};

const questionRegexes = [
  /^\s*question\s*(?:no\.?|number)?\s*[:#-]?\s*(\d{1,4})\s*[.)\-:]?\s+(.+)$/i,
  /^\s*(\d{1,4})\s*[.)\-:]\s+(.+)$/,
];
const optionRegex = /^\s*([A-H])\s*[.)\-:]\s+(.+)$/i;
const inlineAnswerRegex =
  /(?:^|\b)(?:common\s+)?(?:correct\s+)?(?:answer|answers|resposta)\s*[:\-]\s*([A-H,\s/]+)\b/i;
const answerKeyRegexes = [
  /^\s*(\d{1,4})\s*[.)\-:]\s*([A-H,\s/]+)\b/i,
  /^\s*question\s*(\d{1,4})\s*(?:answer)?\s*[:\-]\s*([A-H,\s/]+)\b/i,
  /^\s*(\d{1,4})\s+([A-H,\s/]+)\s*$/i,
];
const questionHeaderRegex = /^\s*question\s+(\d{1,4})(?:\s*[.)\-:]?\s*(.*))?$/i;

function isNoiseLine(line: string): boolean {
  return (
    /^https?:\/\//i.test(line) ||
    /^www\./i.test(line) ||
    /^page\s+\d+/i.test(line) ||
    /^\d+\s*\/\s*\d+$/.test(line) ||
    /^microsoft\s+98-349/i.test(line) ||
    /^latest[-\s]?microsoft/i.test(line) ||
    /^ensurepass\.com/i.test(line) ||
    /^download the complete collection/i.test(line)
  );
}

function parseQuestionStart(line: string): { number: number; prompt: string } | null {
  for (const regex of questionRegexes) {
    const match = line.match(regex);
    if (!match) {
      continue;
    }

    const number = Number(match[1]);
    const prompt = match[2].trim();
    if (!Number.isFinite(number) || !prompt || /^[A-H]$/i.test(prompt)) {
      continue;
    }

    return { number, prompt };
  }

  return null;
}

function collectAnswerKey(lines: string[]): Map<number, string> {
  const answerKey = new Map<number, string>();

  for (const line of lines) {
    for (const regex of answerKeyRegexes) {
      const match = line.match(regex);
      if (!match) {
        continue;
      }

      const number = Number(match[1]);
      const answerLabel = match[2].toUpperCase();
      if (!Number.isFinite(number)) {
        continue;
      }

      answerKey.set(number, answerLabel);
      break;
    }
  }

  return answerKey;
}

function extractAnswerLabels(rawAnswer: string): string[] {
  return Array.from(new Set((rawAnswer.toUpperCase().match(/[A-H]/g) ?? [])));
}

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function finalizeQuestion(
  current: QuestionBuilder | null,
  answerKey: Map<number, string>,
  collector: NormalizedQuestion[]
) {
  if (!current || !current.prompt || current.prompt.length < 8 || current.options.length < 2) {
    return;
  }

  const normalizedHint =
    current.answerHint?.trim().toUpperCase() ??
    answerKey.get(current.number)?.trim().toUpperCase() ??
    "";
  const answerLabels = extractAnswerLabels(normalizedHint);
  const correctAnswers = current.options
    .filter((option) => answerLabels.includes(option.label.toUpperCase()))
    .map((option) => option.text);
  const normalizedCorrectAnswers = correctAnswers.length > 0 ? correctAnswers : [current.options[0].text];

  collector.push({
    prompt: current.prompt,
    options: current.options,
    correctAnswer: normalizedCorrectAnswers[0],
    correctAnswers: normalizedCorrectAnswers,
    explanation: "Importado automaticamente do PDF. Rever a resposta correta no editor.",
    topic: "MTA",
    difficulty: "medium",
    questionType: normalizedCorrectAnswers.length > 1 ? "multiple_select" : "multiple_choice",
  });
}

export async function extractTextFromPdf(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const buffer = await fs.readFile(absolutePath);
  const pdfModule = await import("pdf-parse-debugging-disabled");
  const parsePdf = pdfModule.default as (dataBuffer: Buffer) => Promise<{ text: string }>;
  const output = await parsePdf(buffer);
  return output.text;
}

export function parseQuestionsFromText(text: string): NormalizedQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length > 0 && !isNoiseLine(line));

  const answerKey = collectAnswerKey(lines);
  const questions: NormalizedQuestion[] = [];

  let current: QuestionBuilder | null = null;

  for (const line of lines) {
    const questionHeaderMatch = line.match(questionHeaderRegex);
    if (questionHeaderMatch) {
      const number = Number(questionHeaderMatch[1]);
      const prompt = (questionHeaderMatch[2] ?? "").trim();

      finalizeQuestion(current, answerKey, questions);
      current = {
        number,
        prompt,
        answerHint: null,
        options: [],
      };
      continue;
    }

    const questionStart = parseQuestionStart(line);
    if (questionStart && line.length > 6) {
      finalizeQuestion(current, answerKey, questions);
      current = {
        number: questionStart.number,
        prompt: questionStart.prompt,
        answerHint: null,
        options: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const optionMatch = line.match(optionRegex);
    if (optionMatch) {
      const optionTextWithPossibleHint = optionMatch[2].trim();
      const embeddedAnswerMatch = optionTextWithPossibleHint.match(inlineAnswerRegex);
      const cleanedOptionText = optionTextWithPossibleHint
        .replace(inlineAnswerRegex, "")
        .replace(/\s+/g, " ")
        .trim();

      if (embeddedAnswerMatch) {
        current.answerHint = embeddedAnswerMatch[1];
      }

      if (cleanedOptionText.length === 0) {
        continue;
      }

      current.options.push({
        label: optionMatch[1].toUpperCase(),
        text: cleanedOptionText,
        sortOrder: current.options.length,
      });
      continue;
    }

    const answerMatch = line.match(inlineAnswerRegex);
    if (answerMatch) {
      current.answerHint = answerMatch[1];
      continue;
    }

    if (!current.prompt) {
      current.prompt = line;
      continue;
    }

    if (current.options.length === 0) {
      current.prompt = `${current.prompt} ${line}`.trim();
      continue;
    }

    const lastOption = current.options[current.options.length - 1];
    if (lastOption) {
      lastOption.text = `${lastOption.text} ${line}`.trim();
    }
  }

  finalizeQuestion(current, answerKey, questions);

  const parsed = normalizedQuestionsSchema.safeParse(questions);
  if (!parsed.success) {
    return [];
  }

  return parsed.data;
}
