// Универсальный русификатор ZCode Desktop.
// Использование: node patch.mjs <путь к app.asar> <выходная папка app>
// Извлекает asar, находит файлы по сигнатурам (не по именам), накладывает патчи,
// проверяет синтаксис. При критической ошибке — exit 1.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const [asarPath, outDir] = process.argv.slice(2);
if (!asarPath || !outDir) { console.error('usage: node patch.mjs <app.asar> <outDir>'); process.exit(1); }
// fileURLToPath декодирует %20 и другие escape (pathname — нет):
// в папках с пробелами ("...x64 (1)") файлы не находились.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ru = JSON.parse(fs.readFileSync(path.join(scriptDir, 'ru.json'), 'utf8'));

const applied = [], missed = [];
function patchText(s, from, to, label, isRe = false) {
  if (isRe) {
    if (!from.test(s)) { missed.push(label); return s; }
    applied.push(label); return s.replace(from, to);
  }
  if (!s.includes(from)) { missed.push(label); return s; }
  applied.push(label); return s.split(from).join(to);
}

// --- 1. извлечение ---
console.log('Извлекаю asar ...');
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
asar.extractAll(asarPath, outDir);

// --- 2. найти IntlProvider-файл с каталогом локалей ---
const assetsDir = path.join(outDir, 'out', 'renderer', 'assets');
const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
// имя функции-инициализатора и имя маппинга меняются между версиями:
// 3.12–3.14: ,h=n(),g={"zh-CN":..,"en-US":..};  3.16.3: ,g=r(),_={"zh-CN":m,"en-US":h}
const anchorRe = /(,[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\(\),[A-Za-z_$][\w$]*)=\{"zh-CN":([A-Za-z_$][\w$]*),"en-US":([A-Za-z_$][\w$]*)\}/;
let intlFile = null, m = null;
for (const f of files) {
  const s = fs.readFileSync(path.join(assetsDir, f), 'utf8');
  m = s.match(anchorRe);
  if (m) { intlFile = path.join(assetsDir, f); break; }
}
if (!intlFile) {
  console.error('КРИТИЧНО: каталог локалей (IntlProvider) не найден — версия не поддерживается.');
  console.error('applied:', applied, 'missed:', missed);
  process.exit(1);
}
{
  let s = fs.readFileSync(intlFile, 'utf8');
  // --- найти en-каталог: определение enVar={...} с балансировкой скобок
  // (имена переменных и эвристика "m={" между версиями не сохраняются)
  function findObjSpan(src, varName) {
    const defRe = new RegExp(`[,;\\{]${varName}=\\{`, 'g');
    let dm;
    while ((dm = defRe.exec(src))) {
      let i = dm.index + dm[0].length - 1, depth = 0, inBt = false, inQ = false;
      for (; i < src.length; i++) {
        const c = src[i];
        if (inBt) { if (c === '\\') { i++; continue; } if (c === '`') inBt = false; continue; }
        if (inQ) { if (c === '\\') { i++; continue; } if (c === '"') inQ = false; continue; }
        if (c === '`') inBt = true;
        else if (c === '"') inQ = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return [dm.index + dm[0].length - 1, i + 1]; }
      }
    }
    return null;
  }
  function parsePairs(src, span) {
    const out = {}; const re = /"([^"]+)":`((?:[^`\\]|\\.)*)`/g; let mm;
    const body = src.slice(span[0], span[1]);
    while ((mm = re.exec(body))) out[mm[1]] = mm[2];
    return out;
  }
  {
    const enSpan = findObjSpan(s, m[3]);
    let enKeys = {};
    if (enSpan) {
      // каталог может заканчиваться спредом ...p} — общий блок строк, en их перекрывает
      const spread = s.slice(enSpan[0], enSpan[1]).match(/\.\.\.([A-Za-z_$][\w$]*)\}/);
      if (spread) {
        const baseSpan = findObjSpan(s, spread[1]);
        if (baseSpan) enKeys = parsePairs(s, baseSpan);
      }
      Object.assign(enKeys, parsePairs(s, enSpan));
    }
    let filled = 0;
    for (const k of Object.keys(enKeys)) if (!(k in ru)) { ru[k] = enKeys[k]; filled++; }
    console.log('Новых ключей заполнено английскими:', filled);
  }
  ru['settings.locale.ru-RU'] = 'Русский';
  ru['sidebar.settings.locale.ru-RU'] = 'Русский';
  // интероп jsx-runtime и имя маппинга берём целиком из якоря (группа 1):
  // имена биндингов меняются между сборками (3.12.3: h=n(), 3.14: h=r(),
  // 3.16.3: g=r(),_=…) — хардкод ломал рендерер: "(0, h.jsx) is not a function".
  const inject = `,zcodeRuMsgs=JSON.parse(${JSON.stringify(JSON.stringify(ru))})${m[1]}={"zh-CN":${m[2]},"en-US":${m[3]},"ru-RU":zcodeRuMsgs}`;
  s = s.replace(anchorRe, inject);
  // подпись пункта "Русский" в английском/китайском каталогах
  s = patchText(s, '"settings.locale.en-US":`English`', '"settings.locale.en-US":`English`,"settings.locale.ru-RU":`Русский`', 'label settings');
  s = patchText(s, '"sidebar.settings.locale.en-US":`English`', '"sidebar.settings.locale.en-US":`English`,"sidebar.settings.locale.ru-RU":`Русский`', 'label sidebar');
  // подпись в китайском каталоге: значение уже «中文简体»-стиль, ключа ru там нет — не критично
  fs.writeFileSync(intlFile, s, 'utf8');
  applied.push('каталог ru-RU внедрён в ' + path.basename(intlFile));
}

// --- 3. допустимые локали (zod-схемы) ---
function patchAllFiles(fromStr, toStr, label) {
  let n = 0;
  const roots = [path.join(outDir, 'out', 'main'), path.join(outDir, 'out', 'host'), path.join(outDir, 'out', 'renderer')];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const rel of fs.readdirSync(root, { recursive: true })) {
      const p = path.join(root, rel.toString());
      if (!/\.(js|cjs)$/.test(p) || !fs.statSync(p).isFile()) continue;
      const s = fs.readFileSync(p, 'utf8');
      if (!s.includes(fromStr)) continue;
      fs.writeFileSync(p, s.split(fromStr).join(toStr), 'utf8');
      n++;
    }
  }
  (n ? applied : missed).push(`${label} (${n} файлов)`);
}
patchAllFiles('enum(["zh-CN","en-US"])', 'enum(["zh-CN","en-US","ru-RU"])', 'схема enum("zh-CN","en-US")');
patchAllFiles('enum(["system","zh-CN","en-US"])', 'enum(["system","zh-CN","en-US","ru-RU"])', 'схема enum(system,...)');
patchAllFiles('[`zh-CN`,`en-US`]', '[`zh-CN`,`en-US`,`ru-RU`]', 'union renderer zh/en');
patchAllFiles('[`system`,`zh-CN`,`en-US`]', '[`system`,`zh-CN`,`en-US`,`ru-RU`]', 'union renderer system');

// --- 3b. проверка поддерживаемых языков в рендерере: X===`zh-CN`||X===`en-US` ---
{
  const re = /(\w+)===`zh-CN`\|\|\1===`en-US`/g;
  let n = 0;
  for (const f of files) {
    const fp = path.join(assetsDir, f);
    const s = fs.readFileSync(fp, 'utf8');
    if (!s.match(re)) continue; // match, а не stateful test(/g): lastIndex протекал между файлами
    fs.writeFileSync(fp, s.replace(re, (w, v) => `${v}===\`zh-CN\`||${v}===\`en-US\`||${v}===\`ru-RU\``), 'utf8');
    n++;
  }
  (n ? applied : missed).push(`проверка поддерживаемых языков (${n} файлов)`);
}

// --- 4. переключатели языка в UI (best-effort, минифицированные имена меняются) ---
{
  const p = path.join(assetsDir, path.basename(intlFile));
  // файл с пикерами обычно другой (styles-*.js) — ищем по сигнатуре
  let done = 0;
  for (const f of files) {
    const fp = path.join(assetsDir, f);
    let s = fs.readFileSync(fp, 'utf8');
    const orig = s;
    // sidebar picker: ...value:`zh-CN`,children:X.formatMessage({id:`sidebar.settings.locale.zh-CN`})
    s = s.replace(
      /\(0,([\w$.]+)\)\(([\w$.]+),\{value:`zh-CN`,children:([\w$.]+)\.formatMessage\(\{id:`sidebar\.settings\.locale\.zh-CN`\}\)\}\)/g,
      (w, jsx, v, fm) => `${w},(0,${jsx})(${v},{value:\`ru-RU\`,children:${fm}.formatMessage({id:\`sidebar.settings.locale.ru-RU\`})})`
    );
    // settings page picker: ...value:`en-US`,"data-testid":lo(Ka,`en-US`),children:G.formatMessage({id:`settings.locale.en-US`})
    s = s.replace(
      /\(0,([\w$.]+)\)\(([\w$.]+),\{value:`en-US`,"data-testid":([\w$.]+)\(([\w$.]+),`en-US`\),children:([\w$.]+)\.formatMessage\(\{id:`settings\.locale\.en-US`\}\)\}\)/g,
      (w, jsx, v, lo, ka, fm) => `${w},(0,${jsx})(${v},{value:\`ru-RU\`,"data-testid":${lo}(${ka},\`ru-RU\`),children:${fm}.formatMessage({id:\`settings.locale.ru-RU\`})})`
    );
    if (s !== orig) { fs.writeFileSync(fp, s, 'utf8'); done++; }
  }
  (done ? applied : missed).push(`переключатели языка (${done} файлов)`);
}

// --- 5. трей/меню и «О программе» в main (best-effort) ---
const trayRu = {"titleBar.menu.file":"Файл","titleBar.menu.edit":"Правка","titleBar.menu.view":"Вид","titleBar.menu.window":"Окно","titleBar.menu.help":"Справка","titleBar.menu.file.newTask":"Новая задача","titleBar.menu.file.openWorkspace":"Открыть рабочую папку","titleBar.menu.file.closeWindow":"Закрыть окно","titleBar.menu.edit.undo":"Отменить","titleBar.menu.edit.redo":"Повторить","titleBar.menu.edit.cut":"Вырезать","titleBar.menu.edit.copy":"Копировать","titleBar.menu.edit.paste":"Вставить","titleBar.menu.edit.delete":"Удалить","titleBar.menu.edit.selectAll":"Выделить всё","titleBar.menu.view.toggleFullScreen":"Переключить полноэкранный режим","titleBar.menu.view.actualSize":"Фактический размер","titleBar.menu.view.zoomIn":"Увеличить","titleBar.menu.view.zoomOut":"Уменьшить","titleBar.menu.window.minimize":"Свернуть","titleBar.menu.window.zoom":"Масштаб","titleBar.menu.window.bringAllToFront":"Все окна на передний план","titleBar.menu.app.services":"Службы","titleBar.menu.app.hide":"Скрыть {appName}","titleBar.menu.app.hideOthers":"Скрыть остальные","titleBar.menu.app.showAll":"Показать все","titleBar.menu.app.quit":"Выйти из {appName}","titleBar.menu.help.about":"О программе ZCode","titleBar.menu.help.whatsNew":"Что нового","titleBar.menu.help.checkForUpdates":"Проверить обновления","titleBar.menu.help.toggleDevTools":"Инструменты разработчика","titleBar.menu.help.processMonitor":"Мониторинг процессов","titleBar.menu.help.toggleZCodeStdioTap":"Перехват stdio-обмена агента","titleBar.menu.help.zcodeEndpoint":"ZCode Endpoint","titleBar.menu.help.zcodeEndpoint.production":"Production (по умолчанию)","titleBar.menu.help.zcodeEndpoint.test":"Test","titleBar.menu.help.zcodeEndpoint.custom":"Свой вариант...","titleBar.menu.help.zcodeEndpoint.reset":"Сбросить по умолчанию","titleBar.menu.help.startPerformanceRecording":"Начать запись производительности","titleBar.menu.help.stopPerformanceRecording":"Остановить запись производительности","titleBar.menu.help.feedback":"Обратная связь","titleBar.menu.help.exportLogs":"Экспортировать журналы","titleBar.menu.help.clearAllData":"Очистить все данные","desktopMenu.help.checkingForUpdates":"Проверка обновлений...","desktopMenu.help.updateAvailableVersion":"Доступна новая версия {version}","desktopMenu.help.downloadingUpdateVersion":"Скачивание обновления {version}...","desktopMenu.help.downloadingUpdateProgress":"Скачивание обновления {version}: {progress}","desktopMenu.help.restartToUpdate":"Перезапустить для обновления","dock.menu.showCurrentWindow":"Показать текущее окно","tray.tooltip":"ZCode","tray.menu.openZCode":"Открыть ZCode","tray.menu.quit":"Выйти"};
const aboutRu = `aboutTitle:"О программе ZCode",versionLabel:"версия",okButtonLabel:"ОК",optimizedForAppleSilicon:"Оптимизировано для Apple Silicon.",copyright:__CP(e=>\`Все права защищены © \${e} ZCode.\`,"copyright")`;
let mainPatched = { tray: 0, about: 0 };
const mainDir = path.join(outDir, 'out', 'main');
for (const rel of fs.readdirSync(mainDir, { recursive: true })) {
  const p = path.join(mainDir, rel.toString());
  if (!p.endsWith('.js') || !fs.statSync(p).isFile()) continue;
  let s = fs.readFileSync(p, 'utf8'); const orig = s;
  s = s.replace(/(\w+)=\{"zh-CN":(\{"titleBar\.)/, (w, v, t) => `${v}={"ru-RU":${JSON.stringify(trayRu)},"zh-CN":${t}`);
  s = s.replace(/(\w+)=\{"zh-CN":\{aboutTitle/, (w, v) => `${v}={"ru-RU":{${aboutRu}},"zh-CN":{aboutTitle`);
  if (s !== orig) {
    // copyright — оригинал обёрнут в s(...); заменяем на чистую стрелочную функцию
    s = s.replace('__CP(e=>`Все права защищены © ${e} ZCode.`,"copyright")', '(e=>`Все права защищены © ${e} ZCode.`)');
    fs.writeFileSync(p, s, 'utf8');
    mainPatched.tray += s.includes('"ru-RU":{"titleBar') ? 1 : 0;
    mainPatched.about += s.includes('"ru-RU":{aboutTitle') ? 1 : 0;
  }
}
(mainPatched.tray ? applied : missed).push(`каталог трея (${mainPatched.tray})`);
(mainPatched.about ? applied : missed).push(`каталог «О программе» (${mainPatched.about})`);

// --- 6. валидация: главный патченный файл должен импортироваться без SyntaxError ---
try {
  await import('file:///' + intlFile.replace(/\\/g, '/'));
  applied.push('валидация синтаксиса пройдена');
} catch (e) {
  if (/SyntaxError/.test(e.message)) {
    console.error('КРИТИЧНО: патч сломал синтаксис:', e.message);
    process.exit(1);
  }
  applied.push('синтаксис OK (ошибки только браузерного рантайма: ' + e.message.slice(0, 60) + ')');
}

console.log('=== ПРИМЕНЕНО ===');
applied.forEach(x => console.log(' +', x));
console.log('=== ПРОПУЩЕНО (не критично) ===');
missed.forEach(x => console.log(' -', x));
console.log('PATCH OK');
