/* MyZCode: импорт конфигов из оригинального ZCode (~/.zcode) в изолированные данные MyZCode.
 * Переносим только конфигурацию уровня v2 (настройки, учётные данные, бот, провайдеры);
 * кэши, журналы, БД задач и рабочие папки сознательно не трогаем. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDataBaseDir } from "@zcode/services/node";
import { extractBootstrapDataBaseDir } from "./desktopDataBaseDirBootstrap.js";

export interface ImportFromOriginalZCodeResult {
  /** Откуда импортировали (data root оригинала), null — папка не найдена. */
  sourceDir: string | null;
  /** Наш data root, куда импортировали. */
  targetDir: string;
  copiedFiles: string[];
  mergedFiles: string[];
  keptFiles: string[];
  errors: string[];
}

const IMPORTABLE_V2_FILES = [
  "setting.json",
  "credentials.json",
  "config.json",
  "provider_config.json",
  "bot-config.v3.json",
  "onboarding-record.json",
  "coding-plan-cache.json",
] as const;

/** Корень данных оригинала: ~/.zcode, либо dataBaseDir из его bootstrap-файла. */
function resolveOriginalDataRoot(): string {
  const bootstrapFile = join(homedir(), ".zcode", "v2", "setting.json");
  if (existsSync(bootstrapFile)) {
    try {
      const custom = extractBootstrapDataBaseDir(JSON.parse(readFileSync(bootstrapFile, "utf-8")));
      if (custom) return custom;
    } catch {
      // битый/нечитаемый bootstrap оригинала — откатываемся к стандартному ~/.zcode
    }
  }
  return homedir();
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function importFromOriginalZCode(): ImportFromOriginalZCodeResult {
  const targetDir = join(getDataBaseDir(), ".zcode");
  const result: ImportFromOriginalZCodeResult = {
    sourceDir: null,
    targetDir,
    copiedFiles: [],
    mergedFiles: [],
    keptFiles: [],
    errors: [],
  };

  const sourceDir = resolveOriginalDataRoot();
  result.sourceDir = sourceDir;
  const sourceV2 = join(sourceDir, ".zcode", "v2");
  const targetV2 = join(targetDir, ".zcode", "v2");

  if (!existsSync(sourceV2)) {
    result.errors.push("original-not-found");
    return result;
  }
  if (sourceV2 === targetV2) {
    result.errors.push("same-dir");
    return result;
  }
  mkdirSync(targetV2, { recursive: true });

  const ourSettings = readJsonFile(join(targetV2, "setting.json"));

  for (const fileName of IMPORTABLE_V2_FILES) {
    const sourceFile = join(sourceV2, fileName);
    if (!existsSync(sourceFile)) {
      continue;
    }
    const targetFile = join(targetV2, fileName);
    try {
      if (fileName === "setting.json") {
        // Слияние: база — настройки оригинала, но наш dataBaseDir и русский язык сохраняем,
        // иначе импорт «выдернет» MyZCode из его изолированного корня.
        const originalSettings = readJsonFile(sourceFile);
        if (!originalSettings) {
          result.errors.push(`${fileName}: unreadable`);
          continue;
        }
        const merged: Record<string, unknown> = { ...originalSettings };
        if (ourSettings?.dataBaseDir) {
          merged.dataBaseDir = ourSettings.dataBaseDir;
        }
        if (ourSettings?.locale === "ru-RU") {
          merged.locale = "ru-RU";
          merged.localePreference = "ru-RU";
        }
        writeFileSync(targetFile, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
        result.mergedFiles.push(fileName);
        continue;
      }
      copyFileSync(sourceFile, targetFile);
      result.copiedFiles.push(fileName);
    } catch (error) {
      result.errors.push(
        `${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Наши конфиги, которых нет в оригинале, остаются как есть — перечислим их для отчёта.
  try {
    for (const fileName of IMPORTABLE_V2_FILES) {
      if (
        !result.copiedFiles.includes(fileName) &&
        !result.mergedFiles.includes(fileName) &&
        existsSync(join(targetV2, fileName))
      ) {
        result.keptFiles.push(fileName);
      }
    }
  } catch {
    // отчёт о сохранённых файлах не критичен
  }

  return result;
}
