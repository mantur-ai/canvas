$ErrorActionPreference = "Stop"

$RequiredNodeMajor = 20
$ProjectDir = Resolve-Path (Join-Path $PSScriptRoot "..")

function Write-ManturLog {
  param([string]$Message)
  Write-Host "[Mantur Canvas] $Message"
}

function Test-CommandExists {
  param([string]$Command)
  return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Update-PathFromSystem {
  $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $NodePath = Join-Path $env:ProgramFiles "nodejs"
  $NpmGlobalPath = Join-Path $env:APPDATA "npm"
  $PathItems = @($NodePath, $NpmGlobalPath, $MachinePath, $UserPath) | Where-Object { $_ }
  $env:Path = ($PathItems -join ";")
}

function Get-NodeMajorVersion {
  try {
    return [int](& node -p "Number(process.versions.node.split('.')[0])")
  } catch {
    return 0
  }
}

function Install-Node {
  if (Test-CommandExists "winget") {
    Write-ManturLog "Node.js $RequiredNodeMajor+ was not found. Installing Node.js LTS with winget..."
    winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
    return
  }

  Write-ManturLog "Node.js $RequiredNodeMajor+ was not found, and winget is unavailable."
  Write-ManturLog "Install Node.js $RequiredNodeMajor or later from https://nodejs.org, reopen PowerShell, then run this script again."
  exit 1
}

function Ensure-Node {
  Update-PathFromSystem

  if ((Test-CommandExists "node") -and ((Get-NodeMajorVersion) -ge $RequiredNodeMajor)) {
    Write-ManturLog "Node.js $(& node -v) detected."
    return
  }

  Install-Node
  Update-PathFromSystem

  if (-not (Test-CommandExists "node") -or ((Get-NodeMajorVersion) -lt $RequiredNodeMajor)) {
    Write-ManturLog "Node.js installation completed, but node is not available in this PowerShell session."
    Write-ManturLog "Reopen PowerShell, then run scripts/quick-start.ps1 again."
    exit 1
  }
}

function Ensure-Npm {
  if (Test-CommandExists "npm") {
    Write-ManturLog "npm $(& npm -v) detected."
    return
  }

  Write-ManturLog "npm was not found. Reinstall Node.js $RequiredNodeMajor or later, reopen PowerShell, then run this script again."
  exit 1
}

function Ensure-Opencode {
  Update-PathFromSystem

  if (Test-CommandExists "opencode") {
    $Version = "installed"
    try {
      $Version = & opencode --version
    } catch {
      $Version = "installed"
    }
    Write-ManturLog "opencode $Version detected."
    return
  }

  Write-ManturLog "opencode was not found. Installing opencode globally..."
  npm install -g opencode-ai
  Update-PathFromSystem

  if (-not (Test-CommandExists "opencode")) {
    Write-ManturLog "opencode installation completed, but the opencode command is not on PATH."
    Write-ManturLog "Reopen PowerShell, then run scripts/quick-start.ps1 again."
    exit 1
  }

  Write-ManturLog "opencode $(& opencode --version) is ready."
}

function Get-NextVersion {
  return node -p "require('./package.json').dependencies.next.replace(/^[^0-9]*/, '')"
}

function Test-MissingNextSwcLockEntries {
  $PackageLockPath = Join-Path $ProjectDir "package-lock.json"

  if (-not (Test-Path $PackageLockPath)) {
    return $true
  }

  $LockText = Get-Content $PackageLockPath -Raw
  $SwcPackages = @(
    "@next/swc-darwin-arm64",
    "@next/swc-darwin-x64",
    "@next/swc-linux-arm64-gnu",
    "@next/swc-linux-arm64-musl",
    "@next/swc-linux-x64-gnu",
    "@next/swc-linux-x64-musl",
    "@next/swc-win32-arm64-msvc",
    "@next/swc-win32-x64-msvc"
  )

  foreach ($PackageName in $SwcPackages) {
    if (-not $LockText.Contains('"node_modules/' + $PackageName + '"')) {
      return $true
    }
  }

  return $false
}

function Install-Dependencies {
  Write-ManturLog "Installing project dependencies..."
  npm install

  if (Test-MissingNextSwcLockEntries) {
    Write-ManturLog "Repairing Next.js SWC lockfile entries..."
    npm install --package-lock-only --include=optional "next@$(Get-NextVersion)"
    npm install
  }
}

function Copy-MissingExampleDirectory {
  param(
    [string]$SourceDir,
    [string]$TargetDir
  )

  if (-not (Test-Path $SourceDir)) {
    return
  }

  Get-ChildItem $SourceDir -Recurse -File | ForEach-Object {
    $ResolvedSourceDir = (Resolve-Path $SourceDir).Path
    $RelativePath = $_.FullName.Substring($ResolvedSourceDir.Length) -replace '^[\\/]+', ''
    $TargetFile = Join-Path $TargetDir $RelativePath

    if (Test-Path $TargetFile) {
      return
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $TargetFile) | Out-Null
    Copy-Item $_.FullName $TargetFile
  }
}

function Initialize-ExampleFiles {
  Write-ManturLog "Preparing local db and skills from example..."
  New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir "db") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir "skills") | Out-Null
  Copy-MissingExampleDirectory (Join-Path $ProjectDir "example/db") (Join-Path $ProjectDir "db")
  Copy-MissingExampleDirectory (Join-Path $ProjectDir "example/skills") (Join-Path $ProjectDir "skills")
}

Set-Location $ProjectDir
Ensure-Node
Ensure-Npm
Ensure-Opencode
Install-Dependencies
Initialize-ExampleFiles

Write-ManturLog "Starting Mantur Canvas at http://localhost:3000"
npm run dev
