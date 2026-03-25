import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function findProjectRoot(startDir: string): string {
  let currentDir = startDir;

  for (let i = 0; i < 8; i += 1) {
    const hasPackageJson = fs.existsSync(path.resolve(currentDir, "package.json"));
    const hasPrismaDir = fs.existsSync(path.resolve(currentDir, "prisma"));
    if (hasPackageJson && hasPrismaDir) {
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

function toPrismaSqliteUrl(absoluteFilePath: string): string {
  // Prisma expects absolute SQLite URLs with leading slash on Windows.
  return `file:/${absoluteFilePath.replace(/\\/g, "/")}`;
}

function resolveRuntimeDatabaseUrl(): string {
  const projectRoot = findProjectRoot(process.cwd());
  const defaultAbsoluteDbPath = path.resolve(projectRoot, "prisma", "dev.db");

  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) {
    fs.mkdirSync(path.dirname(defaultAbsoluteDbPath), { recursive: true });
    return toPrismaSqliteUrl(defaultAbsoluteDbPath);
  }

  if (configuredUrl.startsWith("file:./") || configuredUrl.startsWith("file:../")) {
    const relativeDbPath = configuredUrl.slice("file:".length);
    const resolvedAbsoluteDbPath = path.resolve(projectRoot, relativeDbPath);
    fs.mkdirSync(path.dirname(resolvedAbsoluteDbPath), { recursive: true });
    return toPrismaSqliteUrl(resolvedAbsoluteDbPath);
  }

  if (configuredUrl === "file:./dev.db") {
    fs.mkdirSync(path.dirname(defaultAbsoluteDbPath), { recursive: true });
    return toPrismaSqliteUrl(defaultAbsoluteDbPath);
  }

  return configuredUrl;
}

const runtimeDatabaseUrl = resolveRuntimeDatabaseUrl();
process.env.DATABASE_URL = runtimeDatabaseUrl;

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    datasourceUrl: runtimeDatabaseUrl,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
