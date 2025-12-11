#!/bin/bash

###############################################################################
# Cipher Pulse - Script de Déploiement Automatisé
# 
# Usage:
#   ./scripts/deploy.sh staging  # Déploie en staging
#   ./scripts/deploy.sh production  # Déploie en production
#
# Prérequis:
#   - Git configuré
#   - Node.js 18+ installé
#   - Variables d'environnement configurées
###############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment
ENVIRONMENT=${1:-staging}
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

###############################################################################
# Functions
###############################################################################

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

###############################################################################
# Pre-deployment Checks
###############################################################################

pre_deployment_checks() {
  log_info "Running pre-deployment checks..."
  
  # Check Node version
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 18+ required (current: $(node -v))"
    exit 1
  fi
  log_success "Node.js version OK: $(node -v)"
  
  # Check Git status
  if [ -n "$(git status --porcelain)" ]; then
    log_warning "Uncommitted changes detected"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
  log_success "Git status OK"
  
  # Check branch
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [ "$ENVIRONMENT" = "production" ] && [ "$CURRENT_BRANCH" != "master" ] && [ "$CURRENT_BRANCH" != "main" ]; then
    log_error "Production deployments must be from master/main branch (current: $CURRENT_BRANCH)"
    exit 1
  fi
  log_success "Branch OK: $CURRENT_BRANCH"
  
  # Check environment files
  if [ ! -f "$PROJECT_ROOT/apps/bridge/.env" ]; then
    log_error "Missing apps/bridge/.env file"
    exit 1
  fi
  log_success "Environment files OK"
  
  log_success "All pre-deployment checks passed ✨"
  echo
}

###############################################################################
# Security Checks
###############################################################################

security_checks() {
  log_info "Running security checks..."
  
  # Check for exposed secrets in .env
  if git log --all --full-history -- "**/*.env" | grep -q "commit"; then
    log_error ".env files found in Git history! Run git filter-branch to clean."
    exit 1
  fi
  log_success "No .env in Git history"
  
  # Check for console.log with sensitive data
  if grep -r "console\.log.*\(password\|secret\|token\|key\)" apps/frontend/src 2>/dev/null; then
    log_warning "Sensitive console.log detected (review manually)"
  else
    log_success "No sensitive console.log found"
  fi
  
  # Check JWT_SECRET length
  JWT_SECRET=$(grep "^JWT_SECRET=" apps/bridge/.env | cut -d'=' -f2)
  if [ ${#JWT_SECRET} -lt 64 ]; then
    log_error "JWT_SECRET must be at least 64 characters"
    exit 1
  fi
  log_success "JWT_SECRET length OK"
  
  log_success "Security checks passed 🔒"
  echo
}

###############################################################################
# Build & Test
###############################################################################

build_and_test() {
  log_info "Building and testing..."
  
  # Install dependencies
  log_info "Installing dependencies..."
  npm install --silent
  
  # Type check frontend
  log_info "Type checking frontend..."
  cd "$PROJECT_ROOT/apps/frontend"
  npm run type-check
  log_success "Frontend type check OK"
  
  # Build frontend
  log_info "Building frontend..."
  npm run build
  log_success "Frontend build OK"
  
  # Build backend
  log_info "Building backend..."
  cd "$PROJECT_ROOT/apps/bridge"
  npm run build
  log_success "Backend build OK"
  
  cd "$PROJECT_ROOT"
  log_success "Build completed 🎉"
  echo
}

###############################################################################
# Deploy
###############################################################################

deploy() {
  log_info "Deploying to $ENVIRONMENT..."
  
  case $ENVIRONMENT in
    staging)
      deploy_staging
      ;;
    production)
      deploy_production
      ;;
    *)
      log_error "Unknown environment: $ENVIRONMENT"
      exit 1
      ;;
  esac
}

deploy_staging() {
  log_info "Deploying to staging environment..."
  
  # Push to staging branch
  git push origin $CURRENT_BRANCH:staging --force
  
  log_success "Pushed to staging branch"
  log_info "Staging URL: https://cipher-pulse-staging.vercel.app"
  
  echo
  log_info "📝 Manual Steps Required:"
  echo "  1. Open Vercel Dashboard"
  echo "  2. Verify deployment completed"
  echo "  3. Test critical flows (signup, login, send message)"
}

deploy_production() {
  log_info "Deploying to PRODUCTION environment..."
  
  # Confirmation prompt
  echo
  log_warning "🚨 PRODUCTION DEPLOYMENT 🚨"
  echo
  echo "Environment: $ENVIRONMENT"
  echo "Branch: $CURRENT_BRANCH"
  echo "Commit: $(git rev-parse --short HEAD)"
  echo
  read -p "Deploy to PRODUCTION? (type 'yes' to confirm) " -r
  echo
  if [ "$REPLY" != "yes" ]; then
    log_info "Deployment cancelled"
    exit 0
  fi
  
  # Tag release
  VERSION=$(date +"%Y.%m.%d-%H%M")
  git tag "v$VERSION"
  git push origin "v$VERSION"
  log_success "Tagged release: v$VERSION"
  
  # Push to main
  git push origin $CURRENT_BRANCH:main
  
  log_success "Pushed to production branch"
  log_info "Production URL: https://cipher-pulse.vercel.app"
  
  echo
  log_info "📝 Post-Deployment Steps:"
  echo "  1. Monitor logs for errors (Vercel Dashboard)"
  echo "  2. Run smoke tests on production"
  echo "  3. Check Sentry for new errors"
  echo "  4. Announce deployment in team chat"
}

###############################################################################
# Post-Deployment
###############################################################################

post_deployment() {
  log_info "Post-deployment tasks..."
  
  # Create deployment log
  LOG_FILE="$PROJECT_ROOT/deployments/deploy-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).log"
  mkdir -p "$PROJECT_ROOT/deployments"
  
  cat > "$LOG_FILE" <<EOF
Deployment Log
==============
Environment: $ENVIRONMENT
Branch: $CURRENT_BRANCH
Commit: $(git rev-parse HEAD)
Date: $(date)
User: $(whoami)
Node Version: $(node -v)
Status: SUCCESS
EOF
  
  log_success "Deployment log saved: $LOG_FILE"
  echo
}

###############################################################################
# Main
###############################################################################

main() {
  clear
  echo "╔════════════════════════════════════════╗"
  echo "║   Cipher Pulse - Deployment Script    ║"
  echo "╚════════════════════════════════════════╝"
  echo
  log_info "Environment: $ENVIRONMENT"
  echo
  
  pre_deployment_checks
  security_checks
  build_and_test
  deploy
  post_deployment
  
  echo
  log_success "🚀 Deployment to $ENVIRONMENT completed successfully!"
  echo
}

# Run
main
