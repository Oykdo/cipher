# Execution planifiee du reconciliateur des registres.
#
# Pourquoi un enrobage plutot que la tache brute : une detection qu'on ne
# regarde pas ne detecte rien. Ce script ne parle QUE quand quelque chose
# cloche -- sinon il ajoute une ligne au journal et se tait. C'est la seule
# facon qu'une surveillance quotidienne survive a l'habitude.
#
# Il tourne depuis le poste de travail, et pas depuis un serveur, pour une
# raison de fond : lui seul detient legitimement le DSN de la base Cipher ET
# le secret partage d'Eidolon. Les deposer sur un hote pour pouvoir comparer
# reviendrait a melanger les secrets de deux systemes independants.
#
# Installation (voir tools/reconcile-daily.README.md) :
#   schtasks /Create /TN "Cipher - reconciliation des registres" ...
#
# Sortie : 0 tout concorde | 1 derive detectee | 2 execution impossible

$ErrorActionPreference = 'Stop'

$repo    = Split-Path -Parent $PSScriptRoot
$logDir  = Join-Path $env:LOCALAPPDATA 'cipher-reconcile'
$logFile = Join-Path $logDir 'reconcile.log'
$alert   = Join-Path $logDir 'DERIVE-DETECTEE.txt'
$keep    = 60

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location $repo

$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

try {
    # --strict : un avertissement de vivacite compte comme une derive. Un lien
    # mort n'est pas moins grave qu'une incoherence de registre -- il est juste
    # plus discret, ce qui le rend pire.
    $raw  = & node tools/reconcile-vaults.mjs --json --strict --fix 2>&1 | Out-String
    $code = $LASTEXITCODE
} catch {
    $raw  = $_.Exception.Message
    $code = 2
}

$summary = "?"
try {
    $parsed = $raw | ConvertFrom-Json
    $findings = @($parsed.findings)
    $errors = @($findings | Where-Object { $_.severity -eq 'error' }).Count
    $warns  = @($findings | Where-Object { $_.severity -eq 'warn'  }).Count
    $summary = if ($errors -or $warns) { "$errors erreur(s), $warns avertissement(s)" }
               else { 'les quatre registres concordent' }
} catch {
    $summary = 'sortie illisible'
    if ($code -eq 0) { $code = 2 }
}

Add-Content -Path $logFile -Value "$stamp  code=$code  $summary" -Encoding utf8

# Rotation : un journal qu'on ne borne pas finit par ne plus etre lu.
$lines = @(Get-Content $logFile -ErrorAction SilentlyContinue)
if ($lines.Count -gt $keep) {
    Set-Content -Path $logFile -Value ($lines | Select-Object -Last $keep) -Encoding utf8
}

if ($code -eq 0) {
    # Rien a signaler : on efface l'alerte precedente pour qu'un fichier
    # perime ne fasse pas croire a un probleme en cours.
    Remove-Item $alert -ErrorAction SilentlyContinue
    exit 0
}

# Derive : on laisse une trace lisible sans avoir a fouiller le journal.
@"
Derive detectee le $stamp (code $code) - $summary

$raw

Journal complet : $logFile
Relancer a la main : cd $repo ; node tools/reconcile-vaults.mjs --fix
"@ | Set-Content -Path $alert -Encoding utf8

Write-Host "reconciliation : $summary (details : $alert)"
exit $code
