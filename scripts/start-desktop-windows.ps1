$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$InfoUrl = "http://localhost:8000/api/info"
$PetUrl = "http://localhost:8000/desktop-pet.html?mode=premium"
$ProfileDir = Join-Path $Root ".build-cache\windows-desktop-profile"

function Test-NekoServer {
  try {
    $response = Invoke-WebRequest -Uri $InfoUrl -UseBasicParsing -TimeoutSec 1
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

if (-not (Test-NekoServer)) {
  Start-NekoServer
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    if (Test-NekoServer) { break }
    Start-Sleep -Milliseconds 250
  }
}

if (-not (Test-NekoServer)) {
  throw "NEKO.SYNC local server did not start on http://localhost:8000."
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
$browser = Get-BrowserPath
$arguments = @(
  "--app=$PetUrl",
  "--window-size=360,270",
  "--user-data-dir=$ProfileDir",
  "--no-first-run",
  "--disable-features=CalculateNativeWinOcclusion"
)

Start-Process -FilePath $browser -ArgumentList $arguments -WorkingDirectory $Root
