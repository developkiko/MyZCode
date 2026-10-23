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

## Путь 2 — нативный русский в исходниках (MyZCode) — ВЫПОЛНЕНО 2026-10-24

Точки правки в исходниках (`origin/ZCode-main`) — все применены:

1. `packages/shared/src/protocol.ts` — `export type Locale = "zh-CN" | "en-US" | "ru-RU";`
2. `packages/shared/src/validationAppSettings.ts` — `localeSchema`/`localePreferenceSchema` += `"ru-RU"`
3. `packages/ui/src/i18n/locales/ru-RU.ts` — **создан** генератором (6983 ключа, покрытие 100%)
4. `packages/ui/src/i18n/IntlProvider.tsx` — импорт, `MESSAGES["ru-RU"]`, `isLocale()`, системная локаль `ru*` → ru-RU
5. `packages/ui/src/i18n/LocaleSwitcher.tsx` — `LOCALE_CYCLE` += ru-RU, метка «Ру»
6. `packages/ui/src/settingsPageHelpers.tsx` — пункт пикера «Русский» (+ `WorkspaceSidebarFooter.tsx`, id `settings.locale.ru-RU` / `sidebar.settings.locale.ru-RU` добавлены в en-US.ts и zh-CN.ts)
7. `packages/shared/src/desktopMenu.ts` — полный каталог `ru-RU` (48 строк: меню, трей, док)
8. `packages/desktop/src/main/about.ts` — каталог «О программе» для ru-RU
9. `packages/desktop/src/main/autoUpdater.ts` — цикл локалей += ru-RU; фолбэк release notes: en → zh
10. **Дополнительно, чтобы русский не падал в китайский** (ветки `locale === "en-US" ? EN : 中文`):
    - `packages/ui/src/ErrorBoundary.tsx` — роутинг zh/ru/en
    - `packages/ui/src/lib/conversationShareError.ts` — инвертированы тернарники
    - `packages/ui/src/updateReleaseNotes.ts` — фолбэк zh-CN → en-US
    - `packages/desktop/src/main/desktopApplicationMenu.ts` + `pluginSandbox/host.ts` + `renderer/src/desktopPlatform.ts` + `renderer/src/main.tsx` — распознавание системной локали / флагов
    - `packages/ui/src/SettingsPage.tsx` — guard пикера += "ru-RU"
    - `packages/services/src/marketing-touch/*`, `packages/ui/src/components/marketing-touch/*` — типы расширены до Locale, на сервер маппятся zh/en
    - `packages/ui/src/feedback/feedbackSubmitSubmission.ts` — locale → схема тикета (zh/en)
    - `packages/ui/src/rewards/RewardsWebview.tsx` + `packages/shared/src/rewardsEmbedded.ts` — ru → en для страницы rewards
    - `packages/shared/src/remoteAppConfig.ts` — community-URL: ru → en

## Telegram-бот — русский язык (ВЫПОЛНЕНО 2026-10-24)

- `packages/services/src/bots/messages.ts` — тип `BotMessageLocale` += ru-RU,
  полный каталог `ru-RU` (113 сообщений, набор ключей идентичен zh/en — проверено
  скриптом), `normalizeBotMessageLocale()` пропускает ru-RU
- `packages/services/src/bots/replyFormatter.ts` — каталог ru-RU (15 строк)
- `packages/services/src/bots/botsService.ts` — все ~30 ветвлений локали получили
  русские ветки: права (Разрешить/Отклонить/всегда...), метки `[Удалённая]`,
  гранулярность ответов (Обычные/Полные/Краткие/Живая карточка, алиасы),
  режимы (Обычный/План), карточка очереди, /history, темы, привязка и пр.
- Локаль бота берётся из настроек приложения (`settings.locale`): выбранный
  в UI ru-RU автоматически делает бота русскоязычным.

## DevTools по F12 (ВЫПОЛНЕНО)

`packages/desktop/src/main/desktopApplicationMenu.ts` — пункту меню
«Переключить инструменты разработчика» задан `accelerator: "F12"`. Меню
регистрируется глобально через `Menu.setApplicationMenu`, так что F12 работает
даже при скрытой строке меню на Windows.

## Непереведённое (осознанно, фаза 2)

- coding-plan webview и rewards-страница — сервер отдаёт контент только на zh/en
- описания встроенных скиллов (`builtinSkillI18n.ts`) — фолбэк на английский
- веб-версия (`packages/web`), флоу-панели, marketing touch серверный контент

Сборка: `pnpm install` в корне воркспейса → `pnpm --filter @zcode/desktop build`
(сборщик — electron-builder, Electron 41.0.3; смотрите `packages/desktop/package.json`).
