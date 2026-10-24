// Добавляет ключи импорта в локали UI + в словарь translate/ru.json (для регенерации).
import fs from 'fs';

const root = 'C:/WORK/My/MyZCode/origin/ZCode-main/packages/ui/src/i18n/locales';
const entries = {
  'en-US.ts': `  "settings.importFromOriginalZCode": "Import from original ZCode",
  "settings.importFromOriginalZCodeDescription":
    "Copy configs (settings, accounts, bot, providers) from the original ZCode data folder into MyZCode.",
  "settings.importFromOriginalZCode.run": "Import",
  "settings.importFromOriginalZCode.running": "Importing…",
  "settings.importFromOriginalZCode.done": "Imported {count} file(s). Restart MyZCode to apply.",
  "settings.importFromOriginalZCode.failed":
    "Import failed. Make sure the original ZCode is installed and try again.",
`,
  'zh-CN.ts': `  "settings.importFromOriginalZCode": "从原版 ZCode 导入",
  "settings.importFromOriginalZCodeDescription":
    "将原版 ZCode 数据文件夹中的配置（设置、账号、机器人、服务商）复制到 MyZCode。",
  "settings.importFromOriginalZCode.run": "导入",
  "settings.importFromOriginalZCode.running": "导入中…",
  "settings.importFromOriginalZCode.done": "已导入 {count} 个文件。请重启 MyZCode 以生效。",
  "settings.importFromOriginalZCode.failed":
    "导入失败。请确认原版 ZCode 已安装后重试。",
`,
  'ru-RU.ts': `  "settings.importFromOriginalZCode": "Импорт из оригинального ZCode",
  "settings.importFromOriginalZCodeDescription":
    "Скопировать конфиги (настройки, аккаунты, бот, провайдеры) из папки данных оригинального ZCode в MyZCode.",
  "settings.importFromOriginalZCode.run": "Импортировать",
  "settings.importFromOriginalZCode.running": "Импорт…",
  "settings.importFromOriginalZCode.done":
    "Импортировано файлов: {count}. Перезапустите MyZCode, чтобы применить.",
  "settings.importFromOriginalZCode.failed":
    "Импорт не удался. Убедитесь, что оригинальный ZCode установлен, и повторите.",
`,
};

for (const [file, block] of Object.entries(entries)) {
  const p = `${root}/${file}`;
  let src = fs.readFileSync(p, 'utf8');
  if (src.includes('settings.importFromOriginalZCode')) { console.log(file, '— уже есть, пропуск'); continue; }
  const anchor = src.indexOf('"settings.dataBaseDir":');
  if (anchor < 0) { console.error(file, '— якорь settings.dataBaseDir не найден!'); process.exit(1); }
  src = src.slice(0, anchor) + block + src.slice(anchor);
  fs.writeFileSync(p, src, 'utf8');
  console.log(file, '— добавлено');
}

// ru.json — те же ключи для генератора каталога
const ruPath = 'C:/WORK/My/MyZCode/translate/ru.json';
const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
const ruEntries = {
  'settings.importFromOriginalZCode': 'Импорт из оригинального ZCode',
  'settings.importFromOriginalZCodeDescription':
    'Скопировать конфиги (настройки, аккаунты, бот, провайдеры) из папки данных оригинального ZCode в MyZCode.',
  'settings.importFromOriginalZCode.run': 'Импортировать',
  'settings.importFromOriginalZCode.running': 'Импорт…',
  'settings.importFromOriginalZCode.done':
    'Импортировано файлов: {count}. Перезапустите MyZCode, чтобы применить.',
  'settings.importFromOriginalZCode.failed':
    'Импорт не удался. Убедитесь, что оригинальный ZCode установлен, и повторите.',
};
let added = 0;
for (const [k, v] of Object.entries(ruEntries)) {
  if (!(k in ru)) { ru[k] = v; added++; }
}
fs.writeFileSync(ruPath, JSON.stringify(ru, null, 2) + '\n', 'utf8');
console.log('ru.json: добавлено', added);
