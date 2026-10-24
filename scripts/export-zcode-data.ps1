# Экспорт всех данных ZCode/MyZCode в один архив для переноса на другой ПК.
# Переносит: аккаунты, OAuth-токены, API-ключи провайдеров, настройки (включая язык),
# выбор моделей, MCP-серверы и их авторизации, плагины, память агента, сессии/задачи.
#
# Использование:
#   powershell -ExecutionPolicy Bypass -File export-zcode-data.ps1
#   powershell ... -OutFile D:\my-data.tar.gz     # свой путь архива
#   powershell ... -Everything                    # включая кэши и логи (архив крупнее)
#
# Данные лежат в C:\<ваш-пользователь>\.zcode — этот каталог архивируется целиком.

param(
    [string]$OutFile = "",
    [switch]$Everything
)

$ErrorActionPreference = "Stop"
$home_ = [Environment]::GetFolderPath("UserProfile")
$src = Join-Path $home_ ".zcode"

if (-not (Test-Path $src)) {
    Write-Error "Не найдена папка $src — на этом ПК нет данных ZCode."
}

if (-not $OutFile) {
    $stamp = Get-Date -Format "yyyy-MM-dd"
    $OutFile = Join-Path ([Environment]::GetFolderPath("Desktop")) "myzcode-data-$stamp.tar.gz"
}

# Исключаем только возобновляемые кэши и журналы, чтобы архив не раздувался.
$excludes = @()
if (-not $Everything) {
    $excludes = @(
        "--exclude=.zcode/v2/cache",
        "--exclude=.zcode/v2/logs",
        "--exclude=.zcode/v2/crash",
        "--exclude=.zcode/cli/log",
        "--exclude=.zcode/cli/image-cache"
    )
}

Write-Host "Архивирую $src ..."
$tar = Join-Path $env:SystemRoot "System32\tar.exe"
& $tar -czf $OutFile @excludes -C $home_ .zcode
# 0 = всё скопировано; 1 = часть файлов заблокирована запущенным приложением (архив создан).
if ($LASTEXITCODE -gt 1) { Write-Error "tar завершился с ошибкой $LASTEXITCODE" }
elseif ($LASTEXITCODE -eq 1) {
    Write-Warning "Некоторые файлы были заблокированы запущенным ZCode/MyZCode (например, база задач) и пропущены. Для копии 1-в-1 закройте оба приложения и повторите экспорт."
}

$size = (Get-Item $OutFile).Length / 1MB
Write-Host ""
Write-Host ("Готово: {0} ({1:N1} MB)" -f $OutFile, $size) -ForegroundColor Green
Write-Host "Перенесите этот файл на другой ПК и выполните import-zcode-data.ps1 -Archive <путь>"
