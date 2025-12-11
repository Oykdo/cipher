<#
.SYNOPSIS
    Génère une clé cryptographiquement sécurisée.

.DESCRIPTION
    Ce script utilise le générateur de nombres aléatoires sécurisé de .NET (RNGCryptoServiceProvider)
    pour créer des clés aléatoires de haute qualité, idéales pour des mots de passe, des sels, ou des clés d'API.

.PARAMETER Length
    La longueur de la clé en octets (bytes). Par défaut : 64 octets (ce qui donne 128 caractères hexadécimaux).

.PARAMETER Format
    Le format de sortie. Options : 'Hex' (défaut) ou 'Base64'.

.EXAMPLE
    .\generate_secure_key.ps1
    Génère une clé de 64 octets au format Hex.

.EXAMPLE
    .\generate_secure_key.ps1 -Length 32 -Format Base64
    Génère une clé de 32 octets au format Base64.
#>

param(
    [int]$Length = 64,
    [ValidateSet("Hex", "Base64")]
    [string]$Format = "Hex"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    # Création du générateur sécurisé
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] $Length
    $rng.GetBytes($bytes)

    if ($Format -eq "Base64") {
        $key = [Convert]::ToBase64String($bytes)
        Write-Host "Clé générée (Base64, $Length octets) :" -ForegroundColor Green
        Write-Host $key
    }
    else {
        # Conversion en Hex
        $key = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
        Write-Host "Clé générée (Hex, $Length octets) :" -ForegroundColor Green
        Write-Host $key
    }
}
catch {
    Write-Error "Une erreur est survenue lors de la génération de la clé : $_"
}
finally {
    if ($rng) { $rng.Dispose() }
}
