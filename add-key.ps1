$ErrorActionPreference = 'Stop'

$configDir = Join-Path $env:USERPROFILE '.openclaw'
$configPath = Join-Path $configDir 'openclaw.json'

if (-not (Test-Path $configPath)) {
  throw 'openclaw.json not found. Install clawfree first.'
}

$apiKey = Read-Host 'Enter the new oc_ API key'
if (-not $apiKey.StartsWith('oc_')) {
  throw 'API key must start with oc_'
}

$accountId = $apiKey.Substring([Math]::Max(0, $apiKey.Length - 8))
$config = Get-Content $configPath -Raw | ConvertFrom-Json

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
  $channel = $config.channels.clawfree
} else {
  $channel = [pscustomobject]@{}
  $config.channels | Add-Member -NotePropertyName clawfree -NotePropertyValue $channel
}

$channel.enabled = $true
$legacyServerUrl = $null
if ($channel.PSObject.Properties.Name -contains 'serverUrl') {
  $legacyServerUrl = $channel.serverUrl
  $channel.PSObject.Properties.Remove('serverUrl')
}
$channel.mode = 'local'

if ($channel.PSObject.Properties.Name -contains 'apiKey') {
  $channel.PSObject.Properties.Remove('apiKey')
}
if ($channel.PSObject.Properties.Name -contains 'sessionKey') {
  $channel.PSObject.Properties.Remove('sessionKey')
}
if ($channel.PSObject.Properties.Name -contains 'pollIntervalMs') {
  $channel.PSObject.Properties.Remove('pollIntervalMs')
}
if ($channel.PSObject.Properties.Name -contains 'debug') {
  $channel.PSObject.Properties.Remove('debug')
}

if (-not ($channel.PSObject.Properties.Name -contains 'accounts')) {
  $channel | Add-Member -NotePropertyName accounts -NotePropertyValue ([pscustomobject]@{})
}

if ($legacyServerUrl -and $channel.accounts) {
  foreach ($existingAccount in $channel.accounts.PSObject.Properties) {
    if ($existingAccount.Value -and -not ($existingAccount.Value.PSObject.Properties.Name -contains 'serverUrl')) {
      $existingAccount.Value | Add-Member -NotePropertyName serverUrl -NotePropertyValue $legacyServerUrl
    }
  }
}

if ($channel.accounts.PSObject.Properties.Name -contains $accountId) {
  $channel.accounts.PSObject.Properties.Remove($accountId)
}

$channel.accounts | Add-Member -NotePropertyName $accountId -NotePropertyValue ([pscustomobject]@{
  enabled = $true
  apiKey = $apiKey
  pollIntervalMs = 5000
  sessionKey = "agent:clawfree:$accountId"
  debug = $false
})

$config | ConvertTo-Json -Depth 20 | Set-Content $configPath -Encoding UTF8

Write-Host "==> Added key: $accountId"
Write-Host '==> Recommended next command:'
Write-Host 'openclaw gateway'
