param(
  [string]$LaunchUrl = "",
  [string]$BaseUrl = $env:NEKO_SYNC_BASE_URL,
  [string]$DesktopToken = ""
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PackagedLauncherCmd = Join-Path $PSScriptRoot "NEKO.SYNC Client.cmd"
$LegacyPackagedLauncherCmd = Join-Path $PSScriptRoot "NEKO.SYNC Desktop Pet.cmd"
$SourceLauncherCmd = Join-Path $PSScriptRoot "start-desktop-windows.cmd"
$LauncherCmd = if (Test-Path $PackagedLauncherCmd) {
  $PackagedLauncherCmd
} elseif (Test-Path $LegacyPackagedLauncherCmd) {
  $LegacyPackagedLauncherCmd
} else {
  $SourceLauncherCmd
}
$ConfigRoot = if ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "NEKO.SYNC"
} else {
  Join-Path $Root ".build-cache"
}
$ConfigPath = Join-Path $ConfigRoot "desktop-link.json"
$LogPath = Join-Path $ConfigRoot "windows-client.log"

function Write-NekoLog {
  param([string]$Message)
  New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $LogPath -Encoding UTF8 -Value "[$timestamp] $Message"
}

function ConvertFrom-UrlEncodedForm {
  param([string]$Query)
  $values = @{}
  if ([string]::IsNullOrWhiteSpace($Query)) { return $values }
  foreach ($part in $Query.TrimStart("?").Split("&")) {
    if ([string]::IsNullOrWhiteSpace($part)) { continue }
    $pair = $part.Split("=", 2)
    $key = [Uri]::UnescapeDataString($pair[0])
    $value = if ($pair.Count -gt 1) { [Uri]::UnescapeDataString($pair[1]) } else { "" }
    $values[$key] = $value
  }
  return $values
}

function Register-NekoProtocol {
  if (-not (Test-Path $LauncherCmd)) { return }
  $command = "`"$LauncherCmd`" `"%1`""
  $baseKey = "HKCU:\Software\Classes\neko-sync"
  New-Item -Path $baseKey -Force | Out-Null
  Set-Item -Path $baseKey -Value "URL:NEKO.SYNC Desktop Link"
  New-ItemProperty -Path $baseKey -Name "URL Protocol" -Value "" -Force | Out-Null
  New-Item -Path "$baseKey\shell\open\command" -Force | Out-Null
  Set-Item -Path "$baseKey\shell\open\command" -Value $command
}

function Read-NekoConfig {
  if (-not (Test-Path $ConfigPath)) { return @{} }
  try {
    $json = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
    $data = @{}
    foreach ($property in $json.PSObject.Properties) {
      $data[$property.Name] = [string]$property.Value
    }
    return $data
  } catch {
    return @{}
  }
}

function Write-NekoConfig {
  param([hashtable]$Data)
  New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
  $Data | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
}

function Test-NekoServer {
  param([string]$HealthUrl)
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Start-NekoServer {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js was not found. Install Node.js or add node.exe to PATH."
  }
  Start-Process `
    -FilePath $node.Source `
    -ArgumentList "server.js" `
    -WorkingDirectory $Root `
    -WindowStyle Hidden
}

function Get-BrowserPath {
  $commands = @("msedge", "chrome")
  foreach ($command in $commands) {
    $resolved = Get-Command $command -ErrorAction SilentlyContinue
    if ($resolved) {
      return $resolved.Source
    }
  }

  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  throw "Microsoft Edge or Google Chrome was not found."
}

try {
  Write-NekoLog "Starting NEKO.SYNC Windows client. LaunchUrl=$LaunchUrl BaseUrl=$BaseUrl"
  Register-NekoProtocol

  if ($LaunchUrl -like "neko-sync://*") {
    $launchUri = [Uri]$LaunchUrl
    $params = ConvertFrom-UrlEncodedForm $launchUri.Query
    if ($params.ContainsKey("baseUrl") -and -not [string]::IsNullOrWhiteSpace($params["baseUrl"])) {
      $BaseUrl = $params["baseUrl"]
    }
    if ($params.ContainsKey("desktopToken") -and -not [string]::IsNullOrWhiteSpace($params["desktopToken"])) {
      $DesktopToken = $params["desktopToken"]
    }
  }

  $config = Read-NekoConfig
  if ([string]::IsNullOrWhiteSpace($BaseUrl) -and $config.ContainsKey("baseUrl")) {
    $BaseUrl = $config["baseUrl"]
  }
  if ([string]::IsNullOrWhiteSpace($DesktopToken) -and $config.ContainsKey("desktopToken")) {
    $DesktopToken = $config["desktopToken"]
  }

  if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = "https://yutanggo.com"
  }
  $BaseUrl = $BaseUrl.TrimEnd("/")
  if (-not [string]::IsNullOrWhiteSpace($DesktopToken)) {
    Write-NekoConfig @{ baseUrl = $BaseUrl; desktopToken = $DesktopToken }
  }

  $BaseUri = [Uri]$BaseUrl
  $UseLocalServer = @("localhost", "127.0.0.1", "::1") -contains $BaseUri.Host
  $HealthUrl = "$BaseUrl/api/health"
  if ($UseLocalServer -and -not (Test-NekoServer $HealthUrl)) {
    Start-NekoServer
    $deadline = (Get-Date).AddSeconds(8)
    while ((Get-Date) -lt $deadline) {
      if (Test-NekoServer $HealthUrl) { break }
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not (Test-NekoServer $HealthUrl)) {
    throw "NEKO.SYNC service is not reachable at $HealthUrl."
  }

  $query = "client=windows"
  if (-not [string]::IsNullOrWhiteSpace($DesktopToken)) {
    $query = "$query&desktopToken=$([Uri]::EscapeDataString($DesktopToken))"
  }
  $AppUrl = "$BaseUrl/?$query"
  $ProfileDir = Join-Path $ConfigRoot "windows-client-profile"
  New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

  $browser = Get-BrowserPath
  $arguments = @(
    "--app=$AppUrl",
    "--window-size=1280,860",
    "--user-data-dir=$ProfileDir",
    "--no-first-run"
  )
  Write-NekoLog "Opening $AppUrl with $browser"
  Start-Process -FilePath $browser -ArgumentList $arguments -WorkingDirectory $Root | Out-Null
} catch {
  $message = $_.Exception.Message
  Write-NekoLog "ERROR: $message"
  Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
  [System.Windows.MessageBox]::Show(
    "$message`n`nLog: $LogPath",
    "NEKO.SYNC Client",
    "OK",
    "Error"
  ) | Out-Null
  exit 1
}
