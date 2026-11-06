/* oxlint-disable eslint(max-lines) -- категории импорта и слияние SQLite держим одним модулем ради единого отчёта. */
/* MyZCode: импорт данных из оригинального ZCode (~/.zcode) в изолированный корень MyZCode.
 *
 * Раньше импорт копировал фиксированный список файлов v2 целиком. Теперь пользователь
 * выбирает категории, а цель — перенести только выбранное и не перетирать данные MyZCode:
 *  - JSON-конфиги сливаются, а не заменяются;
 *  - SQLite (задачи и чаты) сливаются построчно с INSERT OR IGNORE;
 *  - пути проектов проверяются, отсутствующие можно переназначить.
 *
 * Важно: содержимое provider_config.json/credentials.json никогда не логируем.
 */
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { getDataBaseDir } from "@zcode/services/node";
import { extractBootstrapDataBaseDir } from "./desktopDataBaseDirBootstrap.js";

const nodeRequire = createRequire(import.meta.url);
// tsup/esbuild 会把字面量 "node:sqlite" 改写为 npm 包名；createRequire 保留 node: 协议。
const { DatabaseSync, backup } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

export const IMPORT_CATEGORY_IDS = [
  "providers",
  "plugins",
  "settings",
  "skills",
  "projects",
  "remoteDevices",
  "mcp",
  "memory",
] as const;

export type ImportCategoryId = (typeof IMPORT_CATEGORY_IDS)[number];

export interface ProjectPathRemap {
  from: string;
  to: string;
}

export interface ImportFromOriginalZCodeOptions {
  categories?: ImportCategoryId[];
  /** Только перепривязать пути уже импортированных проектов, без повторного копирования. */
  remapProjectPaths?: ProjectPathRemap[];
}

export interface ImportFromOriginalZCodeResult {
  /** Откуда импортировали (data root оригинала), null — папка не найдена. */
  sourceDir: string | null;
  /** Наш data root, куда импортировали. */
  targetDir: string;
  copiedFiles: string[];
  mergedFiles: string[];
  keptFiles: string[];
  skipped: string[];
  errors: string[];
  /** Абсолютные пути проектов из импортированных чатов, которых нет на диске. */
  missingPaths: string[];
  /** Сколько строк SQLite перенесено/обновлено. */
  importedRows: number;
  /** Сколько путей проектов перепривязано на новые папки. */
  remappedPaths: number;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_CATEGORIES: readonly ImportCategoryId[] = ["providers", "settings"];

const TASKS_DB_TABLES = [
  "hosts",
  "projects",
  "project_roots",
  "remote_project_entries",
  "task_groups",
  "task_group_members",
  "task_group_view_node_orders",
  "task_group_workspace_bootstraps",
  "task_group_admissions",
  "automations",
  "automation_runs",
  "off_peak_tasks",
  "tasks",
] as const;

const REMOTE_DEVICE_TABLES = ["hosts", "remote_project_entries"] as const;

/** Служебные таблицы: их нельзя переносить между установками (версии схемы/identity). */
const CHAT_DB_SKIP_TABLES = new Set([
  "schema_migration",
  "sqlite_sequence",
  "zcode_database_identity",
]);

const SETTINGS_MERGE_PRESERVE_KEYS = ["dataBaseDir", "locale", "localePreference"] as const;

export async function importFromOriginalZCode(
  payload?: unknown,
): Promise<ImportFromOriginalZCodeResult> {
  const options = parseOptions(payload);
  const targetHome = getDataBaseDir();
  const targetZcode = join(targetHome, ".zcode");
  const result: ImportFromOriginalZCodeResult = {
    sourceDir: null,
    targetDir: targetZcode,
    copiedFiles: [],
    mergedFiles: [],
    keptFiles: [],
    skipped: [],
    errors: [],
    missingPaths: [],
    importedRows: 0,
    remappedPaths: 0,
  };

  if (options.remapProjectPaths.length > 0) {
    try {
      result.remappedPaths = await remapProjectPaths(targetZcode, options.remapProjectPaths);
    } catch (error) {
      result.errors.push(`remap: ${errorMessage(error)}`);
    }
    result.missingPaths = await safeCollectMissingPaths(targetZcode, result);
    return result;
  }

  const categories = new Set(options.categories);
  if (categories.size === 0) {
    result.errors.push("no-categories");
    return result;
  }

  const sourceHome = resolveOriginalHome(targetHome);
  result.sourceDir = sourceHome;
  const sourceZcode = join(sourceHome, ".zcode");

  if (!existsSync(sourceZcode)) {
    result.errors.push("original-not-found");
    return result;
  }
  if (samePath(sourceZcode, targetZcode)) {
    result.errors.push("same-dir");
    return result;
  }

  await mkdir(targetZcode, { recursive: true });

  if (categories.has("providers")) {
    await importProviders(sourceZcode, targetZcode, result);
  }
  if (categories.has("settings")) {
    await importSettings(sourceZcode, targetZcode, result);
  }
  if (categories.has("plugins")) {
    await importPlugins(sourceZcode, targetZcode, result);
  }
  if (categories.has("skills")) {
    await importSkills(sourceZcode, targetZcode, result);
  }
  if (categories.has("mcp")) {
    await importMcp(sourceZcode, targetZcode, result);
  }
  if (categories.has("memory")) {
    await importMemory(sourceZcode, targetZcode, result);
  }
  if (categories.has("projects") || categories.has("remoteDevices")) {
    await importDatabases(sourceZcode, targetZcode, categories, result);
    await applyAutomaticWorkspaceRemap(sourceHome, targetHome, targetZcode, result);
  }
  if (categories.has("projects")) {
    result.missingPaths = await safeCollectMissingPaths(targetZcode, result);
  }

  return result;
}

function parseOptions(payload: unknown): Required<ImportFromOriginalZCodeOptions> {
  const record = isRecord(payload) ? payload : {};
  const rawCategories = Array.isArray(record.categories) ? record.categories : null;
  const categories =
    rawCategories === null
      ? [...DEFAULT_CATEGORIES]
      : rawCategories.filter((value): value is ImportCategoryId =>
          IMPORT_CATEGORY_IDS.includes(value as ImportCategoryId),
        );
  const rawRemaps = Array.isArray(record.remapProjectPaths) ? record.remapProjectPaths : [];
  const remapProjectPaths: ProjectPathRemap[] = [];
  for (const item of rawRemaps) {
    if (!isRecord(item)) continue;
    const from = typeof item.from === "string" ? item.from.trim() : "";
    const to = typeof item.to === "string" ? item.to.trim() : "";
    if (from && to && !samePath(from, to)) remapProjectPaths.push({ from, to });
  }
  return { categories: [...new Set(categories)], remapProjectPaths };
}

/** Корень данных оригинала: ~/.zcode, либо dataBaseDir из его bootstrap-файла. */
function resolveOriginalHome(ourHome: string): string {
  const bootstrapFile = join(homedir(), ".zcode", "v2", "setting.json");
  if (existsSync(bootstrapFile)) {
    try {
      const custom = extractBootstrapDataBaseDir(JSON.parse(readFileSync(bootstrapFile, "utf-8")));
      if (custom && !samePath(custom, ourHome)) return custom;
    } catch {
      // битый/нечитаемый bootstrap оригинала — откатываемся к стандартному ~/.zcode
    }
  }
  return homedir();
}

async function importProviders(
  sourceZcode: string,
  targetZcode: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const v2 = join(sourceZcode, "v2");
  const targetV2 = join(targetZcode, "v2");
  await mergeJsonIfExists(
    join(v2, "provider_config.json"),
    join(targetV2, "provider_config.json"),
    result,
  );
  await mergeJsonIfExists(join(v2, "config.json"), join(targetV2, "config.json"), result);
  await mergeJsonIfExists(join(v2, "credentials.json"), join(targetV2, "credentials.json"), result);
  await mergeJsonIfExists(
    join(v2, "coding-plan-cache.json"),
    join(targetV2, "coding-plan-cache.json"),
    result,
  );
}

async function importSettings(
  sourceZcode: string,
  targetZcode: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const sourceV2 = join(sourceZcode, "v2");
  const targetV2 = join(targetZcode, "v2");
  await mergeJsonIfExists(join(sourceV2, "setting.json"), join(targetV2, "setting.json"), result, {
    // dataBaseDir оригинала указывает на его собственный корень; переносить его нельзя,
    // иначе MyZCode снова начнёт читать/писать данные оригинального ZCode.
    dropKeys: ["dataBaseDir"],
    preserveTargetKeys: SETTINGS_MERGE_PRESERVE_KEYS,
  });
  await mergeJsonIfExists(
    join(sourceV2, "bot-config.v3.json"),
    join(targetV2, "bot-config.v3.json"),
    result,
  );
  await mergeJsonIfExists(
    join(sourceV2, "bot-state.v3.json"),
    join(targetV2, "bot-state.v3.json"),
    result,
  );
  await mergeJsonIfExists(
    join(sourceV2, "bot-state.v2.json"),
    join(targetV2, "bot-state.v2.json"),
    result,
  );
  await copyFileIfTargetMissing(
    join(sourceZcode, "AGENTS.md"),
    join(targetZcode, "AGENTS.md"),
    result,
    "AGENTS.md",
  );
}

async function importPlugins(
  sourceZcode: string,
  targetZcode: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const sourceCliPlugins = join(sourceZcode, "cli", "plugins");
  const targetCliPlugins = join(targetZcode, "cli", "plugins");
  const previousInstalled = await readJsonObject(join(targetCliPlugins, "installed_plugins.json"));
  const previousMarketplaces = await readJsonObject(
    join(targetCliPlugins, "known_marketplaces.json"),
  );
  const previousIcons = await readJsonArray(join(targetCliPlugins, "icon-sources.json"));

  await copyDirectoryIfExists(sourceCliPlugins, targetCliPlugins, "cli/plugins", result);
  await rewriteInstalledPluginPaths(sourceCliPlugins, targetCliPlugins, previousInstalled, result);
  await mergeMarketplaceMetadata(previousMarketplaces, targetCliPlugins, result);
  await mergeIconSources(previousIcons, targetCliPlugins, result);

  await copyDirectoryIfExists(
    join(sourceZcode, "plugins"),
    join(targetZcode, "plugins"),
    "plugins",
    result,
  );
  await copyDirectoryIfExists(
    join(sourceZcode, "plugin-workspace"),
    join(targetZcode, "plugin-workspace"),
    "plugin-workspace",
    result,
  );
  await mergeCliConfigKeys(sourceZcode, targetZcode, ["plugins"], result);
}

async function importSkills(
  sourceZcode: string,
  targetZcode: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  await copyDirectoryIfExists(
    join(sourceZcode, "skills"),
    join(targetZcode, "skills"),
    "skills",
    result,
  );
  await copyDirectoryIfExists(
    join(sourceZcode, "commands"),
    join(targetZcode, "commands"),
    "commands",
    result,
  );
  await copyDirectoryIfExists(
    join(sourceZcode, "agents"),
    join(targetZcode, "agents"),
    "agents",
    result,
  );
  await copyDirectoryIfExists(
    join(sourceZcode, "v2", "agents-state.json"),
    join(targetZcode, "v2", "agents-state.json"),
    "v2/agents-state.json",
    result,
  );

  const sourceHome = dirname(sourceZcode);
  const targetHome = dirname(targetZcode);
  await copyDirectoryIfExists(
    join(sourceHome, ".agents", "skills"),
    join(targetHome, ".agents", "skills"),
    ".agents/skills",
    result,
  );
  await copyDirectoryIfExists(
    join(sourceHome, ".agents", "commands"),
    join(targetHome, ".agents", "commands"),
    ".agents/commands",
    result,
  );
  await mergeCliConfigKeys(
    sourceZcode,
    targetZcode,
    ["skills", "hooks", "agents", "subagents", "commands"],
    result,
  );
}

async function importMcp(
  sourceZcode: string,
  targetZcode: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  await mergeCliConfigKeys(sourceZcode, targetZcode, ["mcp"], result);

  const sourceAgentsMcp = join(dirname(sourceZcode), ".agents", "mcp.json");
  const targetAgentsMcp = join(dirname(targetZcode), ".agents", "mcp.json");
  await mergeJsonIfExists(sourceAgentsMcp, targetAgentsMcp, result);
}

async function importMemory(
  sourceZcode: string,
  targetZcode: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const sourceHome = dirname(sourceZcode);
  const targetHome = dirname(targetZcode);
  await copyDirectoryIfExists(
    join(sourceHome, ".claude", "memory"),
    join(targetHome, ".claude", "memory"),
    ".claude/memory",
    result,
  );
  await copyDirectoryIfExists(
    join(sourceZcode, "cli", "memories"),
    join(targetZcode, "cli", "memories"),
    "cli/memories",
    result,
  );
}

async function importDatabases(
  sourceZcode: string,
  targetZcode: string,
  categories: Set<ImportCategoryId>,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const importProjects = categories.has("projects");
  const importRemote = categories.has("remoteDevices");

  const tasksTables = importProjects ? TASKS_DB_TABLES : importRemote ? REMOTE_DEVICE_TABLES : null;
  if (tasksTables) {
    await mergeSqliteDatabase({
      sourcePath: join(sourceZcode, "v2", "tasks-index.sqlite"),
      targetPath: join(targetZcode, "v2", "tasks-index.sqlite"),
      tables: tasksTables,
      result,
      label: "v2/tasks-index.sqlite",
    });
  }

  if (importProjects) {
    await mergeSqliteDatabase({
      sourcePath: join(sourceZcode, "cli", "db", "db.sqlite"),
      targetPath: join(targetZcode, "cli", "db", "db.sqlite"),
      skipTables: CHAT_DB_SKIP_TABLES,
      result,
      label: "cli/db/db.sqlite",
    });
  }
}

interface MergeSqliteOptions {
  sourcePath: string;
  targetPath: string;
  /** Явный порядок таблиц; undefined — все таблицы источника. */
  tables?: readonly string[];
  skipTables?: ReadonlySet<string>;
  label: string;
  result: ImportFromOriginalZCodeResult;
}

async function mergeSqliteDatabase(options: MergeSqliteOptions): Promise<void> {
  if (!existsSync(options.sourcePath)) {
    options.result.skipped.push(options.label);
    return;
  }

  const tempDir = join(tmpdir(), `myzcode-import-${process.pid}-${Date.now()}`);
  const snapshotPath = join(tempDir, "source.sqlite");
  let sourceDb: InstanceType<typeof DatabaseSync> | null = null;
  try {
    await mkdir(tempDir, { recursive: true });
    sourceDb = new DatabaseSync(options.sourcePath, { readOnly: true });
    await backup(sourceDb, snapshotPath);
    sourceDb.close();
    sourceDb = null;

    const sourceTableNames = listTables(snapshotPath);
    const selectedTables =
      options.tables?.filter((table) => sourceTableNames.has(table)) ??
      [...sourceTableNames].filter((table) => !options.skipTables?.has(table));

    if (!existsSync(options.targetPath)) {
      await mkdir(dirname(options.targetPath), { recursive: true });
      await copyFile(snapshotPath, options.targetPath);
      options.result.copiedFiles.push(options.label);
      options.result.importedRows += countRows(snapshotPath, selectedTables);
      return;
    }

    const backupDir = join(dirname(dirname(options.targetPath)), "backup", "import-from-original");
    await mkdir(backupDir, { recursive: true });
    await backupTarget(options.targetPath, join(backupDir, `${basename(options.targetPath)}.bak`));

    const targetDb = new DatabaseSync(options.targetPath);
    try {
      targetDb.exec("PRAGMA foreign_keys=OFF;");
      targetDb.prepare("ATTACH DATABASE ? AS orig").run(snapshotPath);
      try {
        for (const table of selectedTables) {
          try {
            ensureTable(targetDb, table);
            const targetColumns = listColumns(targetDb, table, "main");
            if (targetColumns.size === 0) continue;
            const sourceColumns = listColumns(targetDb, table, "orig");
            const columns = [...targetColumns].filter((column) => sourceColumns.has(column));
            if (columns.length === 0) continue;
            const columnList = columns.map(quoteIdentifier).join(",");
            const statement = targetDb.prepare(
              `INSERT OR IGNORE INTO main.${quoteIdentifier(table)} (${columnList}) SELECT ${columnList} FROM orig.${quoteIdentifier(table)}`,
            );
            options.result.importedRows += Number(statement.run().changes);
          } catch (error) {
            options.result.errors.push(`${options.label}:${table}: ${errorMessage(error)}`);
          }
        }
      } finally {
        targetDb.exec("DETACH DATABASE orig");
      }
    } finally {
      targetDb.close();
    }
    options.result.mergedFiles.push(options.label);
  } catch (error) {
    options.result.errors.push(`${options.label}: ${errorMessage(error)}`);
  } finally {
    sourceDb?.close();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function listTables(databasePath: string): Set<string> {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    return new Set(rows.map((row) => row.name));
  } finally {
    db.close();
  }
}

function countRows(databasePath: string, tables: readonly string[]): number {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  let total = 0;
  try {
    for (const table of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as
          | { count: number }
          | undefined;
        total += Number(row?.count ?? 0);
      } catch {
        // таблица могла исчезнуть между listTables и подсчётом — не критично для отчёта
      }
    }
  } finally {
    db.close();
  }
  return total;
}

async function backupTarget(targetPath: string, backupPath: string): Promise<void> {
  const db = new DatabaseSync(targetPath, { readOnly: true });
  try {
    await backup(db, backupPath);
  } finally {
    db.close();
  }
}

function ensureTable(db: InstanceType<typeof DatabaseSync>, table: string): void {
  const exists = db
    .prepare("SELECT 1 AS found FROM main.sqlite_master WHERE type='table' AND name=?")
    .get(table);
  if (exists) return;
  const row = db
    .prepare("SELECT sql FROM orig.sqlite_master WHERE type='table' AND name=?")
    .get(table) as { sql: string | null } | undefined;
  if (row?.sql) db.exec(row.sql);
}

function listColumns(
  db: InstanceType<typeof DatabaseSync>,
  table: string,
  schema: "main" | "orig",
): Set<string> {
  const rows = db.prepare(`PRAGMA ${schema}.table_info(${quoteIdentifier(table)})`).all() as {
    name: string;
  }[];
  return new Set(rows.map((row) => row.name));
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Внутренние workspace оригинала (default, draft-*) переносим в наш изолированный
 * workspace. Содержимое default-папки не копируем: она может весить сотни мегабайт,
 * а история чатов должна открываться уже в MyZCode, не возвращаясь в ~/.zcode.
 */
async function applyAutomaticWorkspaceRemap(
  sourceHome: string,
  targetHome: string,
  targetZcode: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const sourceWorkspace = join(sourceHome, ".zcode", "workspace");
  const targetWorkspace = join(targetHome, ".zcode", "workspace");
  if (samePath(sourceWorkspace, targetWorkspace)) return;

  const mappings = new Map<string, string>();
  mappings.set(join(sourceWorkspace, "default"), join(targetWorkspace, "default"));

  const addWorkspacePath = (path: string) => {
    const value = path?.trim();
    if (!value) return;
    const relativePath = relative(sourceWorkspace, value);
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return;
    mappings.set(value, join(targetWorkspace, relativePath));
  };

  const tasksDbPath = join(targetZcode, "v2", "tasks-index.sqlite");
  if (existsSync(tasksDbPath)) {
    const db = new DatabaseSync(tasksDbPath, { readOnly: true });
    try {
      for (const row of db.prepare("SELECT DISTINCT workspace_path AS path FROM tasks").all() as {
        path: string;
      }[]) {
        addWorkspacePath(row.path);
      }
    } finally {
      db.close();
    }
  }

  const chatDbPath = join(targetZcode, "cli", "db", "db.sqlite");
  if (existsSync(chatDbPath)) {
    const db = new DatabaseSync(chatDbPath, { readOnly: true });
    try {
      for (const row of db.prepare("SELECT DISTINCT directory AS path FROM session").all() as {
        path: string;
      }[]) {
        addWorkspacePath(row.path);
      }
    } finally {
      db.close();
    }
  }

  try {
    for (const target of mappings.values()) {
      await mkdir(target, { recursive: true });
    }
    result.remappedPaths += await remapProjectPaths(
      targetZcode,
      [...mappings].map(([from, to]) => ({ from, to })),
    );
  } catch (error) {
    result.errors.push(`workspace-remap: ${errorMessage(error)}`);
  }
}

async function remapProjectPaths(
  targetZcode: string,
  mappings: readonly ProjectPathRemap[],
): Promise<number> {
  let changed = 0;
  const tasksDbPath = join(targetZcode, "v2", "tasks-index.sqlite");
  if (existsSync(tasksDbPath)) {
    const db = new DatabaseSync(tasksDbPath);
    try {
      db.exec("PRAGMA foreign_keys=OFF;");
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const mapping of mappings) {
          changed += Number(
            db
              .prepare("UPDATE OR IGNORE project_roots SET root_path=? WHERE root_path=?")
              .run(mapping.to, mapping.from).changes,
          );
          // Если в проекте уже есть новая папка, старая запись становится дублем.
          db.prepare(
            `DELETE FROM project_roots
             WHERE root_path=?
               AND EXISTS (
                 SELECT 1 FROM project_roots other
                 WHERE other.project_id=project_roots.project_id AND other.root_path=?
               )`,
          ).run(mapping.from, mapping.to);
          changed += Number(
            db
              .prepare("UPDATE tasks SET root_path=? WHERE root_path=?")
              .run(mapping.to, mapping.from).changes,
          );
          changed += Number(
            db
              .prepare(
                `UPDATE tasks SET workspace_path=?, workspace_key=CASE
                   WHEN workspace_key=? THEN ?
                   WHEN workspace_identity=? THEN ?
                   ELSE workspace_key END
                 WHERE workspace_path=?`,
              )
              .run(mapping.to, mapping.from, mapping.to, mapping.from, mapping.to, mapping.from)
              .changes,
          );
          changed += remapExecutionDirectories(db, mapping.from, mapping.to);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
  }

  const chatDbPath = join(targetZcode, "cli", "db", "db.sqlite");
  if (existsSync(chatDbPath)) {
    const db = new DatabaseSync(chatDbPath);
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const mapping of mappings) {
          const oldProjectId = projectIdFromDirectory(mapping.from);
          const newProjectId = projectIdFromDirectory(mapping.to);
          changed += Number(
            db
              .prepare("UPDATE session SET directory=?, project_id=? WHERE directory=?")
              .run(mapping.to, newProjectId, mapping.from).changes,
          );
          changed += Number(
            db
              .prepare("UPDATE local_setting SET scope_id=? WHERE scope='project' AND scope_id=?")
              .run(newProjectId, oldProjectId).changes,
          );
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
  }
  return changed;
}

function remapExecutionDirectories(
  db: InstanceType<typeof DatabaseSync>,
  from: string,
  to: string,
): number {
  const rows = db
    .prepare(
      "SELECT rowid AS id, execution_directories AS value FROM tasks WHERE execution_directories IS NOT NULL",
    )
    .all() as { id: number; value: string }[];
  const update = db.prepare("UPDATE tasks SET execution_directories=? WHERE rowid=?");
  let changed = 0;
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const next = parsed.map((entry) => {
      if (typeof entry === "string") return samePath(entry, from) ? to : entry;
      if (isRecord(entry) && typeof entry.path === "string" && samePath(entry.path, from)) {
        return { ...entry, path: to };
      }
      return entry;
    });
    if (JSON.stringify(next) === JSON.stringify(parsed)) continue;
    changed += Number(update.run(JSON.stringify(next), row.id).changes);
  }
  return changed;
}

/** Повторяет CLI-helper projectIdFromDirectory, чтобы переезд папки не рвал группировку чатов. */
function projectIdFromDirectory(directory: string): string {
  const slug = directory
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `proj_${slug || "session"}`;
}

async function safeCollectMissingPaths(
  targetZcode: string,
  result: ImportFromOriginalZCodeResult,
): Promise<string[]> {
  try {
    return collectMissingPaths(targetZcode);
  } catch (error) {
    result.errors.push(`missing-paths: ${errorMessage(error)}`);
    return [];
  }
}

function collectMissingPaths(targetZcode: string): string[] {
  const paths = new Set<string>();

  const tasksDbPath = join(targetZcode, "v2", "tasks-index.sqlite");
  if (existsSync(tasksDbPath)) {
    const db = new DatabaseSync(tasksDbPath, { readOnly: true });
    try {
      addPaths(
        paths,
        db
          .prepare(
            `SELECT DISTINCT r.root_path AS path FROM project_roots r
             JOIN projects p ON p.project_id=r.project_id
             WHERE (p.host_id IS NULL OR p.host_id='local') AND r.root_path IS NOT NULL`,
          )
          .all() as { path: string }[],
      );
      addPaths(
        paths,
        db
          .prepare(
            `SELECT DISTINCT root_path AS path FROM tasks
             WHERE (host_id IS NULL OR host_id='local') AND deleted=0 AND root_path IS NOT NULL`,
          )
          .all() as { path: string }[],
      );
      addPaths(
        paths,
        db
          .prepare(
            `SELECT DISTINCT workspace_path AS path FROM tasks
             WHERE (host_id IS NULL OR host_id='local') AND deleted=0`,
          )
          .all() as { path: string }[],
      );
      const directories = db
        .prepare(
          "SELECT execution_directories AS value FROM tasks WHERE execution_directories IS NOT NULL",
        )
        .all() as { value: string }[];
      for (const row of directories) {
        try {
          const parsed = JSON.parse(row.value) as unknown;
          if (!Array.isArray(parsed)) continue;
          addPaths(
            paths,
            parsed.map((entry) =>
              typeof entry === "string"
                ? { path: entry }
                : isRecord(entry) && typeof entry.path === "string"
                  ? { path: entry.path }
                  : { path: "" },
            ),
          );
        } catch {
          // битый JSON отдельной задачи не должен ломать проверку остальных путей
        }
      }
    } finally {
      db.close();
    }
  }

  const chatDbPath = join(targetZcode, "cli", "db", "db.sqlite");
  if (existsSync(chatDbPath)) {
    const db = new DatabaseSync(chatDbPath, { readOnly: true });
    try {
      addPaths(
        paths,
        db
          .prepare("SELECT DISTINCT directory AS path FROM session WHERE time_deleted IS NULL")
          .all() as { path: string }[],
      );
    } finally {
      db.close();
    }
  }

  return [...paths]
    .filter((path) => !existsSync(path))
    .sort((left, right) => left.localeCompare(right));
}

function addPaths(target: Set<string>, rows: readonly { path: string }[]): void {
  for (const row of rows) {
    const value = row.path?.trim();
    // Удалённые цели и identity не являются локальными папками.
    if (value && isAbsolute(value) && !value.includes("://")) target.add(value);
  }
}

async function mergeCliConfigKeys(
  sourceZcode: string,
  targetZcode: string,
  keys: readonly string[],
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const sourceFile = join(sourceZcode, "cli", "config.json");
  if (!existsSync(sourceFile)) {
    result.skipped.push("cli/config.json");
    return;
  }
  const source = await readJsonObject(sourceFile);
  if (!source) {
    result.errors.push("cli/config.json: unreadable");
    return;
  }
  const selectedKeys = keys.filter((key) => key in source);
  if (selectedKeys.length === 0) return;

  const targetFile = join(targetZcode, "cli", "config.json");
  const target = (await readJsonObject(targetFile)) ?? {};
  for (const key of selectedKeys) {
    target[key] = deepMerge(target[key], source[key]);
  }
  await writeJsonObject(targetFile, target);
  result.mergedFiles.push(`cli/config.json#${selectedKeys.join(",")}`);
}

async function mergeJsonIfExists(
  sourceFile: string,
  targetFile: string,
  result: ImportFromOriginalZCodeResult,
  options?: { preserveTargetKeys?: readonly string[]; dropKeys?: readonly string[] },
): Promise<void> {
  if (!existsSync(sourceFile)) {
    result.skipped.push(relativeLabel(targetFile));
    return;
  }
  const source = await readJsonObject(sourceFile);
  if (!source) {
    result.errors.push(`${relativeLabel(targetFile)}: unreadable`);
    return;
  }
  const target = (await readJsonObject(targetFile)) ?? {};
  const merged = deepMerge(target, source) as JsonRecord;
  for (const key of options?.dropKeys ?? []) {
    delete merged[key];
  }
  for (const key of options?.preserveTargetKeys ?? []) {
    if (key in target) merged[key] = target[key];
  }
  await writeJsonObject(targetFile, merged);
  result.mergedFiles.push(relativeLabel(targetFile));
}

async function copyFileIfTargetMissing(
  sourceFile: string,
  targetFile: string,
  result: ImportFromOriginalZCodeResult,
  label: string,
): Promise<void> {
  if (!existsSync(sourceFile)) {
    result.skipped.push(label);
    return;
  }
  if (existsSync(targetFile)) {
    result.keptFiles.push(label);
    return;
  }
  await mkdir(dirname(targetFile), { recursive: true });
  await copyFile(sourceFile, targetFile);
  result.copiedFiles.push(label);
}

async function copyDirectoryIfExists(
  sourceDir: string,
  targetDir: string,
  label: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  if (!existsSync(sourceDir)) {
    result.skipped.push(label);
    return;
  }
  try {
    await mkdir(dirname(targetDir), { recursive: true });
    await cp(sourceDir, targetDir, { recursive: true, force: true, errorOnExist: false });
    result.copiedFiles.push(label);
  } catch (error) {
    result.errors.push(`${label}: ${errorMessage(error)}`);
  }
}

async function rewriteInstalledPluginPaths(
  sourcePluginsDir: string,
  targetPluginsDir: string,
  previous: JsonRecord | null,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const file = join(targetPluginsDir, "installed_plugins.json");
  const current = await readJsonObject(file);
  if (!current) return;

  const merged = new Map<string, JsonRecord>();
  for (const item of readRecordArray(previous?.plugins)) {
    if (typeof item.id === "string") merged.set(item.id, item);
  }
  for (const item of readRecordArray(current.plugins)) {
    if (typeof item.id !== "string") continue;
    if (typeof item.installPath === "string") {
      item.installPath = rebasePath(item.installPath, sourcePluginsDir, targetPluginsDir);
    }
    merged.set(item.id, item);
  }
  current.plugins = [...merged.values()];
  await writeJsonObject(file, current);
  result.mergedFiles.push("cli/plugins/installed_plugins.json");
}

async function mergeMarketplaceMetadata(
  previous: JsonRecord | null,
  targetPluginsDir: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const file = join(targetPluginsDir, "known_marketplaces.json");
  const current = await readJsonObject(file);
  if (!current) return;
  const merged = new Map<string, JsonRecord>();
  for (const item of readRecordArray(previous?.marketplaces)) {
    if (typeof item.id === "string") merged.set(item.id, item);
  }
  for (const item of readRecordArray(current.marketplaces)) {
    if (typeof item.id === "string") merged.set(item.id, item);
  }
  current.marketplaces = [...merged.values()];
  await writeJsonObject(file, current);
  result.mergedFiles.push("cli/plugins/known_marketplaces.json");
}

async function mergeIconSources(
  previous: unknown[] | null,
  targetPluginsDir: string,
  result: ImportFromOriginalZCodeResult,
): Promise<void> {
  const file = join(targetPluginsDir, "icon-sources.json");
  const current = await readJsonArray(file);
  if (!current) return;
  const merged = new Map<string, unknown>();
  for (const item of previous ?? []) {
    if (isRecord(item) && typeof item.name === "string") merged.set(item.name, item);
  }
  for (const item of current) {
    if (isRecord(item) && typeof item.name === "string") merged.set(item.name, item);
  }
  await writeJsonObject(file, [...merged.values()]);
  result.mergedFiles.push("cli/plugins/icon-sources.json");
}

function readRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function rebasePath(value: string, fromRoot: string, toRoot: string): string {
  if (!isAbsolute(value)) return value;
  const relativePath = relative(fromRoot, value);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return value;
  return join(toRoot, relativePath);
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (isRecord(base) && isRecord(patch)) {
    const merged: JsonRecord = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      merged[key] = key in merged ? deepMerge(merged[key], value) : value;
    }
    return merged;
  }
  return patch;
}

async function readJsonObject(filePath: string): Promise<JsonRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readJsonArray(filePath: string): Promise<unknown[] | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeJsonObject(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function relativeLabel(targetPath: string): string {
  const targetHome = getDataBaseDir();
  const label = relative(targetHome, targetPath);
  return label && !label.startsWith("..") ? label.split(sep).join("/") : targetPath;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const trimmed = value.trim().replace(/[\\/]+$/, "");
    return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
  };
  return normalize(left) === normalize(right);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
