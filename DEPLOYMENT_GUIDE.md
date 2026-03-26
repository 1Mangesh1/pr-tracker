# 🚀 Deployment Guide - GitHub PR Tracker

Complete step-by-step instructions for deploying PR Tracker to Cloudflare.

## ✅ Prerequisites

- **Node.js 16+** - [Download](https://nodejs.org/)
- **Cloudflare Account** - [Sign up free](https://dash.cloudflare.com/sign-up)
- **GitHub Personal Access Token** - [Generate](https://github.com/settings/tokens)
- **Git** (optional) - For version control

## 📋 Quick Start (TL;DR)

```bash
# 1. Install dependencies
npm install

# 2. Set GitHub token
npx wrangler secret put GITHUB_TOKEN
# Paste your token when prompted

# 3. Test locally
npx wrangler dev

# 4. Deploy
npx wrangler deploy
```

✨ **Done!** Your app is now live.

---

## 📖 Detailed Setup

### 1. Clone/Navigate to Project

Your project is ready at:
```
/Users/mangeshbide/Mangesh/LAB/Tracker
```

Navigate there:
```bash
cd /Users/mangeshbide/Mangesh/LAB/Tracker
```

### 2. Install Dependencies

```bash
npm install
```

**What gets installed:**
- `wrangler` - Cloudflare CLI tool
- `typescript` - TypeScript compiler
- `itty-router` - Lightweight router for Workers
- `@cloudflare/workers-types` - TypeScript definitions

### 3. Generate GitHub Personal Access Token

#### Step-by-step:

1. Visit: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a name: `PR Tracker`
4. Set **Expiration**: `90 days` (or your preference)
5. Select scopes:
   - ☑️ `public_repo` (minimum required)
   - ☑️ `read:user` (optional, for user info)
   - Or just check `repo` for everything
6. Click **"Generate token"**
7. **Copy the token immediately** (you won't see it again!)

#### Example token format:
```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Configure Wrangler Secret

Store your GitHub token securely on Cloudflare (never store in .env or code):

```bash
npx wrangler secret put GITHUB_TOKEN
```

You'll be prompted:
```
Enter a value for the secret 'GITHUB_TOKEN':
```

**Paste your token** and press Enter.

#### Verify it worked:

```bash
npx wrangler secret list
```

You should see:
```
GITHUB_TOKEN - You should always keep your secrets secret.
```

(The value is hidden for security)

### 5. Test Locally (Optional but Recommended)

```bash
npx wrangler dev
```

Output:
```
 ⛅️ wrangler 3.x.x
 🎬 Localising pinned dependencies
 ⚙️  Using TypeScript
 ✓ Compiled successfully
 ▲ [wrangler] Listening at http://localhost:8787
```

#### Test the API locally:

In another terminal:
```bash
curl -X POST http://localhost:8787/api/fetch-prs \
  -H "Content-Type: application/json" \
  -d '{"query":"is:pr author:1Mangesh1","maxResults":5}'
```

#### Test the UI:

Open: http://localhost:8787

You should see the PR Tracker UI!

**Press Ctrl+C to stop local dev server**

### 6. Build TypeScript

Before deploying, build the TypeScript:

```bash
npm run build
```

Output:
```
> pr-tracker@1.0.0 build
> tsc
```

(No errors = success!)

### 7. Deploy to Cloudflare

```bash
npx wrangler deploy
```

Output:
```
 ⛅️ wrangler 3.x.x
 🌍 Uploading to Cloudflare...
✅ Successfully published your Worker to
https://pr-tracker.<your-account>.workers.dev
```

🎉 **Your app is live!**

---

## 🌐 First Use

1. Open: `https://pr-tracker.<your-account>.workers.dev`

2. Enter a search query:
   - `is:pr author:1Mangesh1` (your PRs)
   - `is:pr is:merged author:1Mangesh1` (your merged PRs)

3. Set date range for appraisal period

4. Click **"Fetch & Summarize"**

5. Explore results, filter by domain, and export!

---

## 🔧 Configuration

### Environment Variables

For **local development only**, create `.env`:

```bash
# .env (NOT used in production!)
GITHUB_TOKEN=ghp_...
DEFAULT_QUERY=is:pr author:1Mangesh1
```

⚠️ **This .env is ONLY for local development**. For production, use `wrangler secret put`.

### wrangler.toml

Key settings already configured:

```toml
name = "pr-tracker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[ai]
binding = "AI"                    # Workers AI (free!)

[assets]
directory = "public"              # Frontend files

[vars]
RATE_LIMIT_DELAY = "500"         # Delay between AI calls
```

---

## 🐛 Troubleshooting

### Issue: "GITHUB_TOKEN not configured"

**Solution:**
```bash
npx wrangler secret put GITHUB_TOKEN
# Paste your token when prompted
```

### Issue: "Cannot find GitHub token"

**Solution:**
Check if the secret is set:
```bash
npx wrangler secret list
```

Should show `GITHUB_TOKEN - ...`

If not, run the `secret put` command again.

### Issue: "GitHub API rate limited"

**Solution:**
- Wait 60 minutes for rate limit reset
- Or generate a Personal Access Token (allows 5,000 req/hour)

### Issue: "AI summarization failed"

**Solution:**
- Check logs: `npx wrangler tail`
- Retry (might be temporary issue)
- Check Worker memory usage

### Issue: "CORS errors in browser"

**Solution:**
- The Worker automatically adds CORS headers
- Clear browser cache and reload

### Issue: Local dev port 8787 already in use

**Solution:**
```bash
# Use a different port
npx wrangler dev --port 8788
```

### View Production Logs

```bash
npx wrangler tail
```

Streams live logs from your deployed Worker.

---

## 📊 Monitoring

### View Deployment Status

```bash
npx wrangler deployments list
```

### Check Logs

```bash
# Real-time logs
npx wrangler tail

# Pretty formatted
npx wrangler tail --format pretty
```

### Check Usage

Visit https://dash.cloudflare.com → Workers → your-worker → Analytics

---

## 🔄 Updates & Redeployment

When you make code changes:

```bash
# 1. Build TypeScript
npm run build

# 2. Test locally (optional)
npx wrangler dev

# 3. Deploy
npx wrangler deploy
```

Or combine into one command:
```bash
npm run build && npx wrangler deploy
```

---

## 🚀 Performance Tips

1. **Batch Processing**: Process 50+ PRs for better efficiency
2. **Off-Peak Hours**: Run large jobs during low-traffic times
3. **Date Ranges**: Use start/end dates to limit PR count
4. **Caching**: Results are cached in Worker memory during session

---

## 💾 Persistent Caching

Currently, summaries are cached in Worker memory (cleared on redeploy).

For **persistent KV caching** (stores data between deployments):

1. Create KV namespace: `npx wrangler kv:namespace create "pr-cache"`
2. Update `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "CACHE"
   id = "your-namespace-id"
   ```
3. Modify `src/index.ts` to use KV

(This is optional - in-memory cache works fine for most use cases)

---

## 🔐 Security

✅ **GitHub Token**: Stored securely on Cloudflare (not in code/browser)
✅ **CORS**: Configured to prevent unauthorized access
✅ **Input Validation**: All API inputs validated
✅ **Error Anonymization**: Sensitive errors show as generic messages

**Best Practices:**
- Never commit tokens to Git
- Rotate token every 90 days
- Use minimal required scopes (`public_repo` not `admin`)
- Monitor `wrangler tail` for suspicious activity

---

## 🌍 Custom Domain (Optional)

To use a custom domain like `pr-tracker.your-domain.com`:

1. Add your domain to Cloudflare
2. In Cloudflare Dashboard:
   - Go to Workers → Routes
   - Add route: `pr-tracker.your-domain.com/*`
   - Select your Worker: `pr-tracker`

---

## 📝 Next Steps

1. ✅ Deploy the app
2. ✅ Test with your GitHub credentials
3. 📋 Generate your first appraisal report
4. 📊 Track your PRs regularly
5. 🎯 Use reports in performance appraisals

---

## 🤝 Support

- **Cloudflare Docs**: [Workers Guide](https://developers.cloudflare.com/workers/)
- **GitHub API**: [REST API Docs](https://docs.github.com/en/rest)
- **Workers AI**: [AI Models](https://developers.cloudflare.com/workers-ai/)
- **Check Logs**: `npx wrangler tail`

---

**Happy deploying! 🚀**
