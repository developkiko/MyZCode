param([switch]$Elevated)
# Отложенная установка русификации 3.16.3: ждёт закрытия ZCode, потом ставит resources\app.
# Журнал: install-deferred.log рядом со скриптом.
$ErrorActionPreference = "Stop"
$log = "C:\Users\Java\.zcode\workspace\default\ru-work\install-deferred.log"
function L($m){ Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }
$dir = "C:\Program Files\ZCode\resources"
$appDir = Join-Path $dir "app"
$patched = "C:\Users\Java\.zcode\workspace\default\ru-work\app-patched"

if(-not $Elevated){
  L "watcher запущен; жду закрытия ZCode"
  $deadline = (Get-Date).AddHours(24)
  while((Get-Process -Name ZCode -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)){ Start-Sleep -Seconds 5 }
  if(Get-Process -Name ZCode -ErrorAction SilentlyContinue){ L "таймаут ожидания (24ч)"; exit 1 }
  Start-Sleep -Seconds 3
  L "ZCode закрыт, начинаю установку"
  try {
    Set-Content -Path (Join-Path $dir ".zru-wtest") -Value "t" -ErrorAction Stop
    Remove-Item (Join-Path $dir ".zru-wtest") -Force -ErrorAction SilentlyContinue
  } catch {
    L "нет прав на $dir — перезапускаю себя с UAC"
    Start-Process powershell -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-Elevated')
    exit 0
  }
}

try {
  Copy-Item (Join-Path $dir "app.asar") (Join-Path $dir "app.asar.orig") -Force
  L "бэкап: app.asar (3.16.3, англ.) -> app.asar.orig"
  if(Test-Path $appDir){
    $stale = Join-Path $dir "app.stale-3.14"
    if(Test-Path $stale){ Remove-Item $stale -Recurse -Force }
    Rename-Item $appDir "app.stale-3.14" -Force
    L "старая русская папка (3.14) -> app.stale-3.14"
  }
  robocopy $patched $appDir /E /NFL /NDL /NJH /NJS | Out-Null
  if($LASTEXITCODE -ge 8){ throw "robocopy завершился с кодом $LASTEXITCODE" }
  L "патченные файлы установлены в resources\app"
  $settings = "$env:USERPROFILE\.zcode\v2\setting.json"
  if(Test-Path $settings){
    $j = Get-Content $settings -Raw -Encoding UTF8 | ConvertFrom-Json
    if($j.locale -ne "ru-RU"){
      $j.locale = "ru-RU"; $j.localePreference = "ru-RU"
      $j | ConvertTo-Json -Depth 20 | Set-Content $settings -Encoding UTF8
      L "язык в настройках: ru-RU"
    }
  }
  L "ГОТОВО — можно запускать ZCode"
} catch {
  L "ОШИБКА: $_"
  L "откат: удалите resources\app и верните app.stale-3.14 -> app (или app.asar.orig -> app.asar)"
  exit 1
}
