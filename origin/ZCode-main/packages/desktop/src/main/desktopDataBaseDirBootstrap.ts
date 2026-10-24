import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setDataBaseDir } from "@zcode/services/node";

export function resolveBootstrapSettingsFile(homePath: string = homedir()): string {
  return join(homePath, ".zcode", "v2", "setting.json");
}

export function extractBootstrapDataBaseDir(rawValue: unknown): string | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const dataBaseDir = (rawValue as { dataBaseDir?: unknown }).dataBaseDir;
  if (typeof dataBaseDir !== "string") {
    return null;
  }

  const trimmed = dataBaseDir.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBootstrapDataBaseDirFromDisk(
  settingsFile: string = resolveBootstrapSettingsFile(),
): string | null {
  if (!existsSync(settingsFile)) {
    return null;
  }

  try {
    const raw = readFileSync(settingsFile, "utf-8");
    return extractBootstrapDataBaseDir(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function applyEarlyDataBaseDirBootstrap(): string | null {
  // MyZCode: изолированные данные — свой корень (~/.myzcode-data) и свой bootstrap-файл,
  // чтобы не читать настройку dataBaseDir из ~/.zcode оригинального ZCode и не делить
  // с ним конфиги/аккаунты. Пользователь может перенести данные штатной настройкой
  // «Путь хранения данных» — она пишется в bootstrap-файл уже внутри нашего корня.
  const dataBaseDir =
    readBootstrapDataBaseDirFromDisk(resolveMyZCodeBootstrapSettingsFile()) ??
    resolveMyZCodeDataRoot();
  setDataBaseDir(dataBaseDir);
  return dataBaseDir;
}

/** MyZCode: корень изолированных данных (аналог домашней папки оригинала). */
export function resolveMyZCodeDataRoot(homePath: string = homedir()): string {
  return join(homePath, ".myzcode-data");
}

/** MyZCode: bootstrap-файл внутри нашего корня — раньше всех читается при старте. */
export function resolveMyZCodeBootstrapSettingsFile(homePath: string = homedir()): string {
  return join(resolveMyZCodeDataRoot(homePath), ".zcode", "v2", "setting.json");
}
