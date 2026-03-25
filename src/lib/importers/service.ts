import fs from "node:fs/promises";
import path from "node:path";
import { importParsedQuestions, hasImportedDocument } from "@/lib/local-db";
import { extractTextFromPdf, parseQuestionsFromText } from "@/lib/importers/pdf";

type ImportOptions = {
  sourcePath?: string;
  title?: string;
};

export type ImportResult = {
  ok: true;
  document: {
    id: string;
    title: string;
    filePath: string;
  };
  importedCount: number;
  updatedCount: number;
  totalParsed: number;
};

let autoImportPromise: Promise<ImportResult | null> | null = null;

export async function findDefaultPdfPath(): Promise<string | null> {
  const candidateDirs = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "quiz-app"),
  ];

  for (const dir of candidateDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const pdfEntry = entries.find(
        (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")
      );

      if (pdfEntry) {
        return path.join(dir, pdfEntry.name);
      }
    } catch {
      // Ignore inaccessible candidates and continue with next path.
    }
  }

  return null;
}

export async function importQuestionsFromPdf(options: ImportOptions = {}): Promise<ImportResult> {
  const resolvedPdfPath = options.sourcePath
    ? path.resolve(options.sourcePath)
    : await findDefaultPdfPath();

  if (!resolvedPdfPath) {
    throw new Error("Nenhum PDF encontrado. Coloca um PDF na pasta MTAQUIZZ ou envia sourcePath.");
  }

  const rawText = await extractTextFromPdf(resolvedPdfPath);
  const parsedQuestions = parseQuestionsFromText(rawText);

  if (parsedQuestions.length === 0) {
    throw new Error("Nao foi possivel extrair perguntas validas do PDF.");
  }

  return importParsedQuestions({
    filePath: resolvedPdfPath,
    title: options.title || path.basename(resolvedPdfPath),
    rawText,
    parsedQuestions,
  });
}

export async function ensureDefaultPdfImported(): Promise<ImportResult | null> {
  if (autoImportPromise) {
    return autoImportPromise;
  }

  autoImportPromise = (async () => {
    const defaultPdfPath = await findDefaultPdfPath();
    if (!defaultPdfPath) {
      return null;
    }

    const alreadyImported = await hasImportedDocument(defaultPdfPath);
    if (alreadyImported) {
      return null;
    }

    return importQuestionsFromPdf({ sourcePath: defaultPdfPath });
  })();

  try {
    return await autoImportPromise;
  } finally {
    autoImportPromise = null;
  }
}
