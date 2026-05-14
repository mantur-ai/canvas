$ErrorActionPreference = "Stop"

$RequiredNodeMajor = 24
$Pm2AppName = "mantur-canvas"
$AppUrl = "http://localhost:3000"
$NpmRegistry = "https://registry.npmmirror.com"
$env:FFMPEG_BINARIES_URL = "https://cdn.npmmirror.com/binaries/ffmpeg-static"
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

function Get-NodeInstallerArch {
  $Architecture = $env:PROCESSOR_ARCHITECTURE

  if ($Architecture -eq "ARM64") {
    return "arm64"
  }

  if ($Architecture -eq "x86") {
    return "x86"
  }

  return "x64"
}

function Invoke-DownloadFile {
  param(
    [string]$Url,
    [string]$OutputPath
  )

  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutputPath
    return $true
  } catch {
    Write-ManturLog "Download failed from $Url"
    return $false
  }
}

function Get-NodeMsiAsset {
  param(
    [string]$MirrorUrl,
    [string]$Arch
  )

  $NormalizedMirrorUrl = $MirrorUrl.TrimEnd("/") + "/"
  $Index = Invoke-WebRequest -UseBasicParsing -Uri $NormalizedMirrorUrl
  $Content = $Index.Content
  $FilePattern = "node-v([0-9]+\.[0-9]+\.[0-9]+)-$Arch\.msi"

  try {
    $Items = $Content | ConvertFrom-Json
    $Candidates = @($Items | Where-Object { $_.name -match "^$FilePattern$" } | Sort-Object { [version]($_.name -replace "^node-v", "" -replace "-$Arch\.msi$", "") } -Descending)

    if ($Candidates.Count -gt 0) {
      return [pscustomobject]@{
        Name = $Candidates[0].name
        Url = $Candidates[0].url
      }
    }
  } catch {
  }

  $Matches = [regex]::Matches($Content, $FilePattern)
  if ($Matches.Count -eq 0) {
    return $null
  }

  $InstallerNames = @($Matches | ForEach-Object { $_.Value } | Sort-Object { [version]($_ -replace "^node-v", "" -replace "-$Arch\.msi$", "") } -Descending)
  $InstallerName = $InstallerNames[0]

  return [pscustomobject]@{
    Name = $InstallerName
    Url = "$NormalizedMirrorUrl$InstallerName"
  }
}

function Install-NodeWithMsi {
  param([bool]$UseDomesticMirror = $true)

  $Arch = Get-NodeInstallerArch
  if ($UseDomesticMirror) {
    $LatestUrls = @(
      $env:NODE_DIST_MIRROR,
      "https://registry.npmmirror.com/-/binary/node/latest-v$RequiredNodeMajor.x/",
      "https://npmmirror.com/mirrors/node/latest-v$RequiredNodeMajor.x/"
    ) | Where-Object { $_ }
  } else {
    $LatestUrls = @("https://nodejs.org/dist/latest-v$RequiredNodeMajor.x/")
  }

  foreach ($LatestUrl in $LatestUrls) {
    try {
      $NormalizedLatestUrl = $LatestUrl.TrimEnd("/") + "/"
      Write-ManturLog "Checking Node.js $RequiredNodeMajor installer mirror: $NormalizedLatestUrl"

      $Asset = Get-NodeMsiAsset $NormalizedLatestUrl $Arch

      if (-not $Asset) {
        Write-ManturLog "Could not find a Node.js installer for Windows $Arch from $NormalizedLatestUrl"
        continue
      }

      $InstallerName = $Asset.Name
      $InstallerUrl = $Asset.Url
      $InstallerPath = Join-Path $env:TEMP $InstallerName

      if (-not (Invoke-DownloadFile $InstallerUrl $InstallerPath)) {
        continue
      }

      Write-ManturLog "Installing $InstallerName..."

      $Process = Start-Process "msiexec.exe" -ArgumentList "/i", "`"$InstallerPath`"", "/qn", "/norestart" -Wait -PassThru
      if (($Process.ExitCode -ne 0) -and ($Process.ExitCode -ne 3010)) {
        Write-ManturLog "Node.js MSI installer failed with exit code $($Process.ExitCode)."
        continue
      }

      return $true
    } catch {
      Write-ManturLog "Node.js MSI installation failed from $($LatestUrl): $($_.Exception.Message)"
    }
  }

  return $false
}

function Install-Node {
  Write-ManturLog "Node.js $RequiredNodeMajor+ was not found. Trying domestic Node.js MSI mirror first..."
  if (Install-NodeWithMsi -UseDomesticMirror $true) {
    return
  }

  Write-ManturLog "Trying the official Node.js MSI installer..."
  if (Install-NodeWithMsi -UseDomesticMirror $false) {
    return
  }

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

function Use-NpmMirror {
  Write-ManturLog "Configuring npm registry: $NpmRegistry"
  npm config set registry $NpmRegistry
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

function Ensure-Pm2 {
  Update-PathFromSystem

  if (Test-CommandExists "pm2") {
    Write-ManturLog "pm2 $(& pm2 --version) detected."
    return
  }

  Write-ManturLog "pm2 was not found. Installing pm2 globally..."
  npm install -g pm2
  Update-PathFromSystem

  if (-not (Test-CommandExists "pm2")) {
    Write-ManturLog "pm2 installation completed, but the pm2 command is not on PATH."
    Write-ManturLog "Reopen PowerShell, then run scripts/quick-start.ps1 again."
    exit 1
  }

  Write-ManturLog "pm2 $(& pm2 --version) is ready."
}

function Start-WithPm2 {
  $Pm2Status = Get-Pm2AppStatus

  if ($Pm2Status -eq "online") {
    Write-ManturLog "Restarting Mantur Canvas with pm2 at $AppUrl"
    npm run pm2:reload
    return
  }

  if (($Pm2Status -ne "missing") -and ($Pm2Status -ne "unknown")) {
    Write-ManturLog "Removing existing PM2 app in $Pm2Status status before starting..."
    npm run pm2:delete
  }

  Write-ManturLog "Starting Mantur Canvas with pm2 at $AppUrl"
  npm run pm2:start
}

function Get-Pm2AppStatus {
  try {
    $AppsJson = & pm2 jlist
    $Apps = $AppsJson | ConvertFrom-Json
    $App = @($Apps | Where-Object { $_.name -eq $Pm2AppName } | Select-Object -First 1)

    if ($App.Count -eq 0) {
      return "missing"
    }

    return [string]$App[0].pm2_env.status
  } catch {
    return "unknown"
  }
}

function Show-Pm2Diagnostics {
  Write-ManturLog "PM2 status:"
  pm2 status
  Write-ManturLog "Recent PM2 logs for ${Pm2AppName}:"
  pm2 logs $Pm2AppName --lines 80 --nostream
}

function Wait-ForPm2Online {
  $MaxAttempts = 30

  for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
    $Status = Get-Pm2AppStatus

    if ($Status -eq "online") {
      Write-ManturLog "PM2 app is online."
      return $true
    }

    if (($Status -eq "stopped") -or ($Status -eq "errored")) {
      Write-ManturLog "PM2 app status is $Status."
      return $false
    }

    Start-Sleep -Seconds 1
  }

  Write-ManturLog "PM2 app did not become online in time."
  return $false
}

function Wait-ForAppUrl {
  $MaxAttempts = 60

  for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
    try {
      $null = Invoke-WebRequest -UseBasicParsing -Uri $AppUrl -TimeoutSec 2
      Write-ManturLog "Mantur Canvas is ready at $AppUrl"
      return $true
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  Write-ManturLog "Mantur Canvas did not respond at $AppUrl in time."
  return $false
}

function Open-AppUrl {
  try {
    Write-ManturLog "Opening Mantur Canvas at $AppUrl"
    Start-Process $AppUrl
  } catch {
    Write-ManturLog "Could not open browser automatically: $($_.Exception.Message)"
  }
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

  $DbDir = Join-Path $ProjectDir "db"
  $DbConfigPath = Join-Path $DbDir "config.json"
  if (Test-Path $DbConfigPath) {
    Write-ManturLog "db/config.json already exists. Skipping example db copy."
  } else {
    New-Item -ItemType Directory -Force -Path $DbDir | Out-Null
    Copy-MissingExampleDirectory (Join-Path $ProjectDir "example/db") $DbDir
  }

  $SkillsDir = Join-Path $ProjectDir "skills"
  if (Test-Path $SkillsDir) {
    Write-ManturLog "skills directory already exists. Skipping example skills copy."
  } else {
    New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null
    Copy-MissingExampleDirectory (Join-Path $ProjectDir "example/skills") $SkillsDir
  }
}

Set-Location $ProjectDir
Ensure-Node
Ensure-Npm
Use-NpmMirror
Ensure-Opencode
Ensure-Pm2
Install-Dependencies
Initialize-ExampleFiles

Write-ManturLog "Building Mantur Canvas for production..."
npm run build

Start-WithPm2
if (-not (Wait-ForPm2Online)) {
  Show-Pm2Diagnostics
  exit 1
}

if (-not (Wait-ForAppUrl)) {
  Show-Pm2Diagnostics
  exit 1
}

Open-AppUrl
exit 0
