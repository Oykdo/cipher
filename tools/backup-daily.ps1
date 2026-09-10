# Execution planifiee de la sauvegarde de la base Cipher, suivie de sa
# repetition de restauration.
#
# Les deux gestes sont indissociables et c'est tout l'interet de les enchainer
# ici : une sauvegarde qu'on n'a jamais rechargee est une hypothese. Le script
# ecrit la copie du jour, puis la recharge dans un schema jetable de la base
# et compare ligne a ligne. Si la comparaison echoue, la copie existe quand
# meme -- mais on le sait le jour ou elle est prise, pas le jour ou elle sert.
#
# Comme le reconciliateur, il ne parle que quand quelque chose cloche. Une
# surveillance quotidienne qui produit du bruit cesse d'etre lue.
#
# Il tourne depuis le poste de travail parce que lui seul detient legitimement
# le DSN de la base.
#
# Installation : voir tools/backup-daily.README.md
#
# Sortie : 0 sauvegarde prise et prouvee | 1 divergence | 2 execution impossible

$ErrorActionPreference = 'Stop'

$repo    = Split-Path -Parent $PSScriptRoot
$logDir  = Join-Path $env:LOCALAPPDATA 'cipher-db-backup'
$logFile = Join-Path $logDir 'backup.log'
$alert   = Join-Path $logDir 'SAUVEGARDE-ECHOUEE.txt'
$keep    = 60

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location $repo

$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

try {
    $backup     = & node tools/backup-cipher-db.mjs 2>&1 | Out-String
    $backupCode = $LASTEXITCODE
} catch {
    $backup     = $_.Exception.Message
    $backupCode = 2
}

# La repetition ne tourne que si la copie est saine : recharger un fichier
# qu'on sait divergent n'apprendrait rien de plus.
$verify = ''
$verifyCode = 0
if ($backupCode -eq 0) {
    try {
        $verify     = & node tools/restore-cipher-db.mjs 2>&1 | Out-String
        $verifyCode = $LASTEXITCODE
    } catch {
        $verify     = $_.Exception.Message
        $verifyCode = 2
    }
}

$code = if ($backupCode -ne 0) { $backupCode } else { $verifyCode }

$summary = switch ($code) {
    0 { 'copie prise et rechargement prouve fidele' }
    1 { if ($backupCode -eq 1) { 'la copie diverge de la base' }
        else { 'la copie ne se recharge pas fidelement' } }
    default { 'execution impossible' }
}

Add-Content -Path $logFile -Value "$stamp  code=$code  $summary" -Encoding utf8

$lines = @(Get-Content $logFile -ErrorAction SilentlyContinue)
if ($lines.Count -gt $keep) {
    Set-Content -Path $logFile -Value ($lines | Select-Object -Last $keep) -Encoding utf8
}

if ($code -eq 0) {
    Remove-Item $alert -ErrorAction SilentlyContinue
    exit 0
}

@"
Sauvegarde Cipher en echec le $stamp (code $code) - $summary

--- sauvegarde ---
$backup

--- repetition de restauration ---
$verify

Journal complet : $logFile
Relancer a la main :
  cd $repo
  node tools/backup-cipher-db.mjs
  node tools/restore-cipher-db.mjs
"@ | Set-Content -Path $alert -Encoding utf8

Write-Host "sauvegarde : $summary (details : $alert)"
exit $code
