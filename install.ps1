$ErrorActionPreference = 'Stop'

$repoUrl = 'https://github.com/hktea/clawfree.git'
$tempDir = Join-Path $env:TEMP 'clawfree'
$pluginDir = Join-Path $env:USERPROFILE '.openclaw\extensions\clawfree'
$configDir = Join-Path $env:USERPROFILE '.openclaw'
$configPath = Join-Path $configDir 'openclaw.json'
$openClawCmd = (Get-Command openclaw.cmd -ErrorAction SilentlyContinue).Source

if (-not $openClawCmd) {
  throw 'openclaw.cmd not found. Install OpenClaw first and ensure it is in PATH.'
}

function Remove-ClawfreeConfig([object]$config) {
  if ($config.plugins) {
    if ($config.plugins.allow) {
      $config.plugins.allow = @($config.plugins.allow | Where-Object { $_ -ne 'clawfree' })
    }

    if ($config.plugins.entries -and $config.plugins.entries.PSObject.Properties.Name -contains 'clawfree') {
      $config.plugins.entries.PSObject.Properties.Remove('clawfree')
    }
  }

  if ($config.channels -and $config.channels.PSObject.Properties.Name -contains 'clawfree') {
    $config.channels.PSObject.Properties.Remove('clawfree')
  }
}

Write-Host '==> Download clawfree'
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
git clone $repoUrl $tempDir
Set-Location $tempDir

Write-Host '==> Install dependencies'
npm install

Write-Host '==> Build plugin'
npm run build

if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Path $configDir | Out-Null
}

if (Test-Path $configPath) {
  $backupPath = Join-Path $configDir ("openclaw.json.clawfree-installer.bak." + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Copy-Item $configPath $backupPath -Force
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  Remove-ClawfreeConfig $config
  $config | ConvertTo-Json -Depth 20 | Set-Content $configPath -Encoding UTF8
}

Write-Host '==> Install plugin'
Write-Host '==> If OpenClaw asks for security confirmation, allow it and continue'
if (Test-Path $pluginDir) {
  Remove-Item $pluginDir -Recurse -Force -ErrorAction SilentlyContinue
}
& $openClawCmd plugins install .

$apiKey = Read-Host 'Enter your oc_ API key'
if (-not $apiKey.StartsWith('oc_')) {
  throw 'API key must start with oc_'
}
$accountId = $apiKey.Substring([Math]::Max(0, $apiKey.Length - 8))

if (Test-Path $configPath) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
  $config = [pscustomobject]@{}
}

if (-not $config.plugins) {
  $config | Add-Member -NotePropertyName plugins -NotePropertyValue ([pscustomobject]@{})
}

if (-not $config.plugins.allow) {
  $config.plugins | Add-Member -NotePropertyName allow -NotePropertyValue @()
}

$config.plugins.allow = @($config.plugins.allow + 'clawfree') | Select-Object -Unique

if (-not $config.plugins.entries) {
  $config.plugins | Add-Member -NotePropertyName entries -NotePropertyValue ([pscustomobject]@{})
}

if ($config.plugins.entries.PSObject.Properties.Name -contains 'clawfree') {
  $config.plugins.entries.PSObject.Properties.Remove('clawfree')
}

$config.plugins.entries | Add-Member -NotePropertyName clawfree -NotePropertyValue ([pscustomobject]@{
  enabled = $true
})

if (-not $config.channels) {
  $config | Add-Member -NotePropertyName channels -NotePropertyValue ([pscustomobject]@{})
}

if ($config.channels.PSObject.Properties.Name -contains 'clawfree') {
  $config.channels.PSObject.Properties.Remove('clawfree')
}

$config.channels | Add-Member -NotePropertyName clawfree -NotePropertyValue ([pscustomobject]@{
  enabled = $true
  mode = 'local'
  accounts = [pscustomobject]@{
    $accountId = [pscustomobject]@{
      enabled = $true
      apiKey = $apiKey
      pollIntervalMs = 5000
      sessionKey = "agent:clawfree:$accountId"
      debug = $false
    }
  }
})

$config | ConvertTo-Json -Depth 20 | Set-Content $configPath -Encoding UTF8

Write-Host '==> Done. Current plugin list:'
& $openClawCmd plugins list

Write-Host '==> Recommended next command:'
Write-Host 'openclaw status --deep'
