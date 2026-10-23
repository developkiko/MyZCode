# MyZCode

Собственная сборка ZCode Desktop с встроенной русской локализацией.

## Структура

- `origin/ZCode-main/` — исходники ZCode (с github, ветка main)
- `translate/` — инструменты русификации: словарь `ru.json` (~7150 строк, включая
  все 1023 новых строки 3.16.3), патчер собранного asar, генератор `ru-RU.ts`,
  полная документация процесса — см. `translate/README.md`
- `plugins/` — сторонние инструменты, кандидаты на интеграцию/изучение:
  - `zcode-account-switcher` — переключение аккаунтов ZCode (jinpeng-vnode)
  - `ZCode-Agent-Kit` — прокси ZCode-токенов для сторонних ассистентов (ZepiGit)
  - `zcode-account-manager-public` — GUI-менеджер аккаунтов (Asati-git)

## Статус

- [x] Словарь 3.16.3 полный (7152 ключа, покрытие en-каталога 100%)
- [x] Патчер `patch.mjs` адаптирован под 3.16.3 (новые якоря IntlProvider)
- [ ] Нативный ru-RU в исходниках (список правок: `translate/README.md`)
- [ ] Сборка MyZCode (electron-builder, Electron 41.0.3)
- [ ] GitHub remote + push
