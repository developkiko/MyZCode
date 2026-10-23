# Русификация ZCode Desktop — инструменты и документация

## Как устроена локализация в ZCode

- Каталог сообщений — один минифицированный файл `out/renderer/assets/IntlProvider-*.js`,
  внутри: `...,g=r(),_={"zh-CN":m,"en-US":h}` + объекты-каталоги с бэктик-строками,
  заканчивающиеся спредом общего блока (`...p}`).
- Тип `Locale = "zh-CN" | "en-US"` и zod-схема валидации настроек.
- Трей/меню — отдельные каталоги в `out/main/*` (`{"zh-CN":{"titleBar...`), «О программе» — `{"zh-CN":{aboutTitle`.

## Почему не сработала установка в resources\app (3.16.3)

Electron при запуске ищет код приложения в таком порядке (официальная документация):
**1. `resources/app.asar` → 2. `resources/app/` → 3. default_app**.

Пока рядом лежит `app.asar`, папка `app` игнорируется. В 3.14 работало, потому что
`install-ru.ps1` переименовывал `app.asar` → `app.asar.orig`. В отложенном установщике
`install-deferred.ps1` (окт 2026) это упустили: asar был только скопирован в бэкап,
но не убран → Electron грузил английский asar.

**Мгновенный фикс (без пересборки):** закрыть ZCode и переименовать
`C:\Program Files\ZCode\resources\app.asar` (например в `app.asar.english`),
перезапустить — подхватится уже лежащая русифицированная папка `app` (3.16.3, 1023 новые строки).

## Состав

| Файл | Назначение |
|---|---|
| `ru.json` | Словарь: ~7150 ключей `id: "перевод"` (включая все 1023 новых строки 3.16.3) |
| `patch.mjs` | Патчер собранного `app.asar`: распаковка, внедрение `ru-RU`, валидация синтаксиса |
| `install-ru.ps1` | Установщик: патч → `resources\app`, переименование asar (правильный, как в 3.14) |
| `install-deferred.ps1` | Отложенный вариант через schtasks (ждёт закрытия ZCode). ⚠ В этой версии НЕ переименовывает asar — учтено в README выше |
| `analyze.mjs` | Дифф: извлекает asar, парсит en-каталог, находит ключи, которых нет в ru.json |
| `ru-add-1..3.json` | Переводы 1023 новых строк 3.16.3 (уже влиты в ru.json; оставлены как история) |
| `missing.json` | Список новых ключей 3.16.3 (архив задачи) |
| `gen-ru-catalog.mjs` | Генератор `ru-RU.ts` для ИСХОДНИКОВ: берёт ключи из en-US.ts + переводы из ru.json |

## Путь 2 — нативный русский в исходниках (MyZCode)

Точки правки в исходниках (`origin/ZCode-main`):

1. `packages/shared/src/protocol.ts` — `export type Locale = "zh-CN" | "en-US" | "ru-RU";`
2. `packages/shared/src/validationAppSettings.ts` — `localeSchema`/`localePreferenceSchema` += `"ru-RU"`
3. `packages/ui/src/i18n/locales/ru-RU.ts` — **новый файл** (генерируется `gen-ru-catalog.mjs`)
4. `packages/ui/src/i18n/IntlProvider.tsx` — импорт, `MESSAGES["ru-RU"]`, `isLocale()`
5. `packages/ui/src/i18n/LocaleSwitcher.tsx` — `LOCALE_CYCLE`, `LOCALE_LABELS["ru-RU"]="Ру"`
6. `packages/ui/src/settingsPageHelpers.tsx` (~строка 399–405) — пункт пикера «Русский»
7. `packages/shared/src/desktopMenu.ts` — запись `ru-RU` в `desktopMenuMessages`
8. `packages/desktop/src/main/about.ts` — каталог «О программе» для ru-RU
9. `packages/desktop/src/main/autoUpdater.ts` — `for (const locale of ["zh-CN","en-US","ru-RU"])`

Все прочие места — конструкции вида `locale === "zh-CN" ? X : английский` — для русского
безопасно падают в английскую ветку (фаза 2, полировка).

Сборка: `pnpm install` в корне воркспейса → `pnpm --filter @zcode/desktop build`
(сборщик — electron-builder, Electron 41.0.3; смотрите `packages/desktop/package.json`).
