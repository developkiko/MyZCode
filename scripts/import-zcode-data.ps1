# Импорт данных ZCode/MyZCode из архива, созданного export-zcode-data.ps1.
# Заменяет C:\<пользователь>\.zcode на содержимое архива (старая папка сохраняется как бэкап).
#
# Использование:
#   powershell -ExecutionPolicy Bypass -File import-zcode-data.ps1 -Archive C:\path\myzcode-data-2026-10-24.tar.gz
#   powershell ... -Force    # дополнительно закрыть запущенные ZCode/MyZCode автоматически
#
# После импорта запустите MyZCode — аккаунты, API-ключи, модели, плагины, MCP и
# сессии будут на месте. Если язык не подхватился: Настройки -> Язык -> Русский.

param(
    [Parameter(Mandatory = $true)]
    [string]$Archive,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Archive)) {
    Write-Error "Архив не найден: $Archive"
}

$procs = Get-Process -Name "ZCode", "MyZCode" -ErrorAction SilentlyContinue
if ($procs) {
    if ($Force) {
        Write-Host "Закрываю запущенные ZCode/MyZCode..."
        $procs | Stop-Process -Force
        Start-Sleep -Seconds 2
    } else {
        Write-Error "Запущены ZCode/MyZCode. Закройте их и запустите снова, либо добавьте -Force."
    }
}

$home_ = [Environment]::GetFolderPath("UserProfile")
$target = Join-Path $home_ ".zcode"

if (Test-Path $target) {
    $backup = "$target.backup-$(Get-Date -Format 'yyyy-MM-dd-HH-mm-ss')"
    Write-Host "Существующие данные переношу в бэкап: $backup"
    Move-Item $target $backup
}

Write-Host "Распаковываю $Archive -> $home_ ..."
$tar = Join-Path $env:SystemRoot "System32\tar.exe"
& $tar -xzf $Archive -C $home_
if ($LASTEXITCODE -ne 0) {
    if (Test-Path "$target.backup-*") {
        Write-Warning "Распаковка не удалась. Восстанавливаю бэкап..."
        Move-Item (Get-Item "$target.backup-*" | Select-Object -First 1).FullName $target
    }
    Write-Error "tar завершился с ошибкой $LASTEXITCODE"
}

Write-Host ""
Write-Host "Готово! Данные восстановлены в $target" -ForegroundColor Green
Write-Host "Запустите MyZCode и проверьте: аккаунты, API-ключи, модели, плагины, MCP."
Write-Host "Если всё в порядке, папку-бэкап можно удалить."
