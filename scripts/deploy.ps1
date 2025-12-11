# Cipher Pulse - Script de Déploiement (PowerShell)
# Usage: .\scripts\deploy.ps1 -Environment staging

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("staging", "production")]
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Colors
function Write-Info { Write-Host "ℹ️  $args" -ForegroundColor Blue }
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Warning { Write-Host "⚠️  $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "❌ $args" -ForegroundColor Red }

###############################################################################
# Pre-deployment Checks
###############################################################################

function Test-PreDeployment {
    Write-Info "Running pre-deployment checks..."
    
    # Check Node version
    $nodeVersion = (node -v).Replace('v', '').Split('.')[0]
    if ([int]$nodeVersion -lt 18) {
        Write-Error "Node.js 18+ required (current: $(node -v))"
        exit 1
    }
    Write-Success "Node.js version OK: $(node -v)"
    
    # Check Git status
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Warning "Uncommitted changes detected"
        $continue = Read-Host "Continue anyway? (y/n)"
        if ($continue -ne 'y') { exit 1 }
    }
    Write-Success "Git status OK"
    
    # Check branch
    $currentBranch = git rev-parse --abbrev-ref HEAD
    if ($Environment -eq "production" -and $currentBranch -notin @("master", "main")) {
        Write-Error "Production deployments must be from master/main branch (current: $currentBranch)"
        exit 1
    }
    Write-Success "Branch OK: $currentBranch"
    
    # Check environment files
    if (!(Test-Path "$ProjectRoot\apps\bridge\.env")) {
        Write-Error "Missing apps/bridge/.env file"
        exit 1
    }
    Write-Success "Environment files OK"
    
    Write-Success "All pre-deployment checks passed ✨"
    Write-Host ""
}

###############################################################################
# Security Checks
###############################################################################

function Test-Security {
    Write-Info "Running security checks..."
    
    # Check for .env in Git history
    $envInGit = git log --all --full-history -- "**/*.env" 2>$null
    if ($envInGit) {
        Write-Error ".env files found in Git history!"
        exit 1
    }
    Write-Success "No .env in Git history"
    
    # Check JWT_SECRET length
    $envContent = Get-Content "$ProjectRoot\apps\bridge\.env" -Raw
    $jwtSecret = ($envContent | Select-String -Pattern "JWT_SECRET=(.+)" -AllMatches).Matches.Groups[1].Value
    if ($jwtSecret.Length -lt 64) {
        Write-Error "JWT_SECRET must be at least 64 characters"
        exit 1
    }
    Write-Success "JWT_SECRET length OK"
    
    Write-Success "Security checks passed 🔒"
    Write-Host ""
}

###############################################################################
# Build & Test
###############################################################################

function Invoke-BuildAndTest {
    Write-Info "Building and testing..."
    
    # Install dependencies
    Write-Info "Installing dependencies..."
    npm install --silent
    
    # Type check frontend
    Write-Info "Type checking frontend..."
    Push-Location "$ProjectRoot\apps\frontend"
    npm run type-check
    Write-Success "Frontend type check OK"
    Pop-Location
    
    # Build frontend
    Write-Info "Building frontend..."
    Push-Location "$ProjectRoot\apps\frontend"
    npm run build
    Write-Success "Frontend build OK"
    Pop-Location
    
    # Build backend
    Write-Info "Building backend..."
    Push-Location "$ProjectRoot\apps\bridge"
    npm run build
    Write-Success "Backend build OK"
    Pop-Location
    
    Write-Success "Build completed 🎉"
    Write-Host ""
}

###############################################################################
# Deploy
###############################################################################

function Invoke-Deploy {
    Write-Info "Deploying to $Environment..."
    
    $currentBranch = git rev-parse --abbrev-ref HEAD
    
    if ($Environment -eq "staging") {
        # Deploy to staging
        git push origin "${currentBranch}:staging" --force
        Write-Success "Pushed to staging branch"
        Write-Info "Staging URL: https://cipher-pulse-staging.vercel.app"
        
        Write-Host ""
        Write-Info "📝 Manual Steps Required:"
        Write-Host "  1. Open Vercel Dashboard"
        Write-Host "  2. Verify deployment completed"
        Write-Host "  3. Test critical flows"
    }
    else {
        # Deploy to production
        Write-Host ""
        Write-Warning "🚨 PRODUCTION DEPLOYMENT 🚨"
        Write-Host ""
        Write-Host "Environment: $Environment"
        Write-Host "Branch: $currentBranch"
        Write-Host "Commit: $(git rev-parse --short HEAD)"
        Write-Host ""
        
        $confirm = Read-Host "Deploy to PRODUCTION? (type 'yes' to confirm)"
        if ($confirm -ne "yes") {
            Write-Info "Deployment cancelled"
            exit 0
        }
        
        # Tag release
        $version = Get-Date -Format "yyyy.MM.dd-HHmm"
        git tag "v$version"
        git push origin "v$version"
        Write-Success "Tagged release: v$version"
        
        # Push to main
        git push origin "${currentBranch}:main"
        Write-Success "Pushed to production branch"
        Write-Info "Production URL: https://cipher-pulse.vercel.app"
        
        Write-Host ""
        Write-Info "📝 Post-Deployment Steps:"
        Write-Host "  1. Monitor logs (Vercel Dashboard)"
        Write-Host "  2. Run smoke tests"
        Write-Host "  3. Check Sentry for errors"
    }
}

###############################################################################
# Main
###############################################################################

Clear-Host
Write-Host "╔════════════════════════════════════════╗"
Write-Host "║   Cipher Pulse - Deployment Script    ║"
Write-Host "╚════════════════════════════════════════╝"
Write-Host ""
Write-Info "Environment: $Environment"
Write-Host ""

Test-PreDeployment
Test-Security
Invoke-BuildAndTest
Invoke-Deploy

Write-Host ""
Write-Success "🚀 Deployment to $Environment completed successfully!"
Write-Host ""
