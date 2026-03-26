.PHONY: help install build dev deploy clean test logs secret deploy-prod

# Variables
PROJECT_NAME := pr-tracker
GITHUB_ORG := 1Mangesh1
GITHUB_REPO := pr-tracker
WORKERS_URL := https://$(PROJECT_NAME).1mangesh1.workers.dev

help: ## Display this help screen
	@grep -h -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	@echo "📦 Installing dependencies..."
	npm install
	@echo "✅ Dependencies installed"

build: ## Build TypeScript
	@echo "🔨 Building TypeScript..."
	npm run build
	@echo "✅ Build complete"

dev: ## Run local development server
	@echo "🔧 Starting dev server at http://localhost:8787..."
	npx wrangler dev

dev-port: ## Run dev on custom port (use PORT=8788 make dev-port)
	@echo "🔧 Starting dev server at http://localhost:$(PORT)..."
	npx wrangler dev --port $(PORT)

test-api: ## Test API endpoint locally
	@echo "🧪 Testing API endpoint..."
	curl -X POST http://localhost:8787/api/fetch-prs \
	  -H "Content-Type: application/json" \
	  -d '{"query":"is:pr author:1Mangesh1","maxResults":5}'

secret-list: ## List all Wrangler secrets
	@echo "🔐 Secrets stored:"
	npx wrangler secret list

secret-github: ## Set GitHub token secret
	@echo "🔐 Setting GITHUB_TOKEN secret..."
	npx wrangler secret put GITHUB_TOKEN

deploy: build ## Build and deploy to Cloudflare
	@echo "🚀 Deploying to Cloudflare Workers..."
	npx wrangler deploy
	@echo "✅ Deployed! Visit: $(WORKERS_URL)"

deploy-prod: build ## Deploy to production (same as deploy)
	@echo "🚀 Deploying to PRODUCTION..."
	npx wrangler deploy --env production
	@echo "✅ Production deployment complete"

logs: ## View production logs (tail)
	@echo "📊 Streaming logs from production..."
	npx wrangler tail

logs-pretty: ## View logs with pretty formatting
	@echo "📊 Streaming logs (pretty format)..."
	npx wrangler tail --format pretty

logs-filter: ## Filter logs (use LOG_FILTER="error" make logs-filter)
	@echo "📊 Filtering logs for: $(LOG_FILTER)"
	npx wrangler tail --filter $(LOG_FILTER)

status: ## Check deployment status
	@echo "📋 Checking deployment status..."
	npx wrangler deployments list

clean: ## Remove build and cache files
	@echo "🧹 Cleaning up..."
	rm -rf dist
	rm -rf node_modules/.cache
	rm -rf .wrangler
	@echo "✅ Cleanup complete"

clean-all: clean ## Remove all generated files including node_modules
	@echo "🧹 Full cleanup (including dependencies)..."
	rm -rf node_modules
	rm -rf package-lock.json
	@echo "✅ Full cleanup complete"

git-init: ## Initialize git repository
	@echo "📝 Initializing git..."
	git init
	git add .
	git commit -m "🎉 Initial commit: PR Tracker with Cloudflare Workers"
	@echo "✅ Git initialized"

git-status: ## Show git status
	git status

git-log: ## Show git commit history
	git log --oneline -10

gh-repo-create: ## Create GitHub repository using gh CLI
	@echo "🚀 Creating GitHub repository with gh CLI..."
	@if [ -z "$(GITHUB_ORG)" ]; then \
		echo "❌ GITHUB_ORG not set"; \
		exit 1; \
	fi
	@if gh repo view $(GITHUB_ORG)/$(GITHUB_REPO) 2>/dev/null; then \
		echo "⚠️  Repository already exists: $(GITHUB_ORG)/$(GITHUB_REPO)"; \
		read -p "Delete existing repo and create new? (y/n) " -n 1 -r; \
		echo; \
		if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
			gh repo delete $(GITHUB_ORG)/$(GITHUB_REPO) --yes; \
			sleep 2; \
			gh repo create $(GITHUB_ORG)/$(GITHUB_REPO) --public --source=. --remote=origin --push; \
			echo "✅ Repository created and code pushed"; \
		else \
			echo "Skipping repo creation"; \
		fi; \
	else \
		echo "Creating new repository..."; \
		gh repo create $(GITHUB_ORG)/$(GITHUB_REPO) --public --source=. --remote=origin --push; \
		echo "✅ Repository created and code pushed"; \
	fi

gh-repo-info: ## Display GitHub repository information
	@echo "📋 Repository information:"
	@gh repo view $(GITHUB_ORG)/$(GITHUB_REPO) --json URL,description,pushedAt,primaryLanguage

gh-set-description: ## Set repository description on GitHub
	@echo "📝 Setting repository description..."
	gh repo edit $(GITHUB_ORG)/$(GITHUB_REPO) --description "GitHub PR Tracker & AI Summarizer with Cloudflare Workers - Free tier, no API keys needed"

gh-add-topics: ## Add topics/tags to repository
	@echo "🏷️  Adding topics to repository..."
	gh repo edit $(GITHUB_ORG)/$(GITHUB_REPO) --add-topic cloudflare-workers --add-topic github-api --add-topic ai --add-topic pr-tracker --add-topic workers-ai

setup: git-init gh-repo-create gh-set-description gh-add-topics secret-github build ## Complete setup: git init, create repo, configure, build
	@echo ""
	@echo "╔════════════════════════════════════════════════════════════╗"
	@echo "║        ✅ Setup Complete!                                  ║"
	@echo "╠════════════════════════════════════════════════════════════╣"
	@echo "║                                                            ║"
	@echo "║  Repository: https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)         ║"
	@echo "║  GitHub Token: Configured                                 ║"
	@echo "║  TypeScript: Built & Ready                                ║"
	@echo "║                                                            ║"
	@echo "║  Next steps:                                               ║"
	@echo "║    1. make dev         - Test locally                       ║"
	@echo "║    2. make deploy      - Deploy to Cloudflare              ║"
	@echo "║                                                            ║"
	@echo "╚════════════════════════════════════════════════════════════╝"
	@echo ""

full-setup: install setup ## Full setup from scratch: install deps, git init, create repo, build

quick-deploy: build deploy ## Quick build & deploy

pull: ## Pull latest changes from GitHub
	git pull origin main

push: ## Push changes to GitHub
	@echo "📤 Pushing to GitHub..."
	git push origin main

commit: ## Create a commit (use MSG="your message" make commit)
	@if [ -z "$(MSG)" ]; then \
		echo "❌ Please provide commit message: MSG=\"your message\" make commit"; \
		exit 1; \
	fi
	git add .
	git commit -m "$(MSG)"
	git push origin main

version: ## Show versions
	@echo "Node: $$(node --version)"
	@echo "npm: $$(npm --version)"
	@echo "Wrangler: $$(npx wrangler --version)"
	@if command -v gh &> /dev/null; then \
		echo "GitHub CLI: $$(gh --version)"; \
	else \
		echo "GitHub CLI: Not installed"; \
	fi

requirements: ## Check if all required tools are installed
	@echo "🔍 Checking requirements..."
	@command -v node >/dev/null 2>&1 && echo "✅ Node.js installed" || echo "❌ Node.js NOT installed"
	@command -v npm >/dev/null 2>&1 && echo "✅ npm installed" || echo "❌ npm NOT installed"
	@command -v gh >/dev/null 2>&1 && echo "✅ GitHub CLI installed" || echo "❌ GitHub CLI NOT installed"
	@command -v git >/dev/null 2>&1 && echo "✅ Git installed" || echo "❌ Git NOT installed"

auth-gh: ## Authenticate with GitHub CLI
	@echo "🔐 Authenticating with GitHub..."
	gh auth login

auth-status: ## Check GitHub CLI authentication status
	@echo "🔐 GitHub CLI authentication status:"
	gh auth status

docs: ## Open documentation in browser (macOS)
	@echo "📖 Opening documentation..."
	open ./README.md

.DEFAULT_GOAL := help
