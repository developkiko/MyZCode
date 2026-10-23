// Анализ новой версии: извлечение asar, дифф ключей локализации, поиск telegram-строк.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire('C:/Program Files/ZCode/zcode-ru/node_modules/');
const asar = require('@electron/asar');

const ASAR = 'C:/Program Files/ZCode/resources/app.asar';
const OUT = 'C:/Users/Java/.zcode/workspace/default/ru-work/app-new';
const RU = JSON.parse(fs.readFileSync('C:/Program Files/ZCode/zcode-ru/ru.json', 'utf8'));

if (!fs.existsSync(path.join(OUT, 'out'))) {
  console.log('Извлекаю asar (341 MB, пару минут)...');
  asar.extractAll(ASAR, OUT);
} else {
  console.log('asar уже извлечён, переиспользую');
}

const assetsDir = path.join(OUT, 'out', 'renderer', 'assets');
const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
// 3.16.3: ,g=r(),_={"zh-CN":m,"en-US":h}; 3.14 был: ,h=n(),g={"zh-CN":..,"en-US":..}
const anchorRe = /(,[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\(\),[A-Za-z_$][\w$]*)=\{"zh-CN":([A-Za-z_$][\w$]*),"en-US":([A-Za-z_$][\w$]*)\}/;
let intlFile = null, m = null;
for (const f of files) {
  const s = fs.readFileSync(path.join(assetsDir, f), 'utf8');
  m = s.match(anchorRe);
  if (m) { intlFile = path.join(assetsDir, f); console.log('IntlProvider файл:', path.basename(f), '| маппинг:', m[0].slice(0, 60)); break; }
}
if (!intlFile) { console.error('КРИТИЧНО: якорь каталога локалей не найден!'); process.exit(1); }

const s = fs.readFileSync(intlFile, 'utf8');
const enVar = m[3];

// Найти определение obj={...} — со балансировкой скобок (skip внутри `...` и "...")
function findObj(src, varName) {
  const defRe = new RegExp(`[,;\\{]${varName}=\\{`, 'g');
  let dm;
  while ((dm = defRe.exec(src))) {
    let i = dm.index + dm[0].length - 1; // на '{'
    let depth = 0, inBt = false, inQ = false;
    for (; i < src.length; i++) {
      const c = src[i];
      if (inBt) { if (c === '\\') { i++; continue; } if (c === '`') inBt = false; continue; }
      if (inQ) { if (c === '\\') { i++; continue; } if (c === '"') inQ = false; continue; }
      if (c === '`') inBt = true;
      else if (c === '"') inQ = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return { start: dm.index + dm[0].length - 1, end: i + 1 }; }
    }
  }
  return null;
}

function parsePairs(span) {
  const out = {};
  const body = s.slice(span.start, span.end);
  const re = /"([^"]+)":`((?:[^`\\]|\\.)*)`/g;
  let mm;
  while ((mm = re.exec(body))) out[mm[1]] = mm[2];
  return out;
}

// en-каталог может заканчиваться спредом ...p} — общий блок строк; мерджим как базу
const enSpan = findObj(s, enVar);
if (!enSpan) { console.error('не нашёл определение en-каталога ' + enVar); process.exit(1); }
const enBody = s.slice(enSpan.start, enSpan.end);
const spread = enBody.match(/\.\.\.([A-Za-z_$][\w$]*)\}/);
let baseKeys = {}, enKeys = {};
if (spread) {
  const baseSpan = findObj(s, spread[1]);
  if (baseSpan) {
    baseKeys = parsePairs(baseSpan);
    console.log(`Общий блок ${spread[1]}: ${Object.keys(baseKeys).length} ключей`);
  }
}
enKeys = { ...baseKeys, ...parsePairs(enSpan) };
console.log(`Всего ключей в en-каталоге (с базой): ${Object.keys(enKeys).length}, в ru.json: ${Object.keys(RU).length}`);

const missing = {};
for (const k of Object.keys(enKeys)) if (!(k in RU)) missing[k] = enKeys[k];
const obsolete = Object.keys(RU).filter(k => !(k in enKeys));
fs.writeFileSync(path.join(__dirname, 'missing.json'), JSON.stringify(missing, null, 2), 'utf8');
fs.writeFileSync(path.join(__dirname, 'en-catalog.json'), JSON.stringify(enKeys, null, 2), 'utf8');
console.log(`Новых (нет в ru.json): ${Object.keys(missing).length} -> missing.json`);
console.log(`Устаревших (в ru.json, нет в en): ${obsolete.length}`);

// --- telegram-строки ---
const tgHits = [];
for (const f of [...files, ...fs.readdirSync(path.join(OUT, 'out', 'main')).filter(x => x.endsWith('.js')).map(x => '../main/' + x)]) {
  const fp = f.startsWith('../') ? path.join(OUT, 'out', 'main', f.slice(8)) : path.join(assetsDir, f);
  const src = fs.readFileSync(fp, 'utf8');
  const keyRe = /[A-Za-z0-9_.-]*[Tt]elegram[A-Za-z0-9_.-]*/g;
  const seen = new Set();
  let km;
  while ((km = keyRe.exec(src))) {
    if (!seen.has(km[0])) { seen.add(km[0]); tgHits.push(`${path.basename(fp)}: ${km[0]}`); }
  }
}
fs.writeFileSync(path.join(__dirname, 'telegram-hits.txt'), tgHits.join('\n'), 'utf8');
console.log(`Telegram-упоминаний (уникальных идентификаторов): ${tgHits.length} -> telegram-hits.txt`);
// i18n-ключи с telegram
const tgKeys = tgHits.map(l => l.split(': ')[1]).filter(x => /^(settings|sidebar|common|tray|desktopMenu|chat|account|integrations)\./.test(x));
console.log('Из них похожи на i18n-ключи:', JSON.stringify([...new Set(tgKeys)], null, 2));
