param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,

  [string]$Source = "C:\inetpub\wwwroot\barman-storereact\server\backups",

  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Source backup directory not found: $Source"
}

if (-not (Test-Path -LiteralPath $Destination)) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
}

# Mirror backup files to destination using restartable mode.
$rc = Start-Process -FilePath robocopy.exe -ArgumentList @(
  $Source,
  $Destination,
  "*.db",
  "/E",
  "/Z",
  "/R:2",
  "/W:2",
  "/NFL",
  "/NDL",
  "/NP",
  "/NJH",
  "/NJS"
) -NoNewWindow -PassThru -Wait

# Robocopy success codes are 0-7.
if ($rc.ExitCode -gt 7) {
  throw "Robocopy failed with exit code $($rc.ExitCode)"
}

# Optional retention policy on destination.
if ($RetentionDays -gt 0) {
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $Destination -Recurse -File -Filter *.db |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force
}

Write-Host "Backup copy completed successfully."
