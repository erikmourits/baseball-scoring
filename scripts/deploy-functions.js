#!/usr/bin/env node
/**
 * Deploy all Supabase Edge Functions.
 *
 * Setup:
 *   1. Install Supabase CLI:  npm install -g supabase
 *   2. Login:                 supabase login
 *   3. Set SUPABASE_PROJECT_REF in .env.development / .env.production
 *   4. Set secrets:           supabase secrets set OPENAI_API_KEY=sk-...
 *   5. npm run deploy-functions:dev   (or deploy-functions:prod)
 *
 * Flags:
 *   --env dev   Load .env.development, link to dev project
 *   --env prod  Load .env.production, link to prod project
 *   (default: .env)
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const functionsDir = join(root, 'supabase', 'functions')

// ── Parse --env flag ──────────────────────────────────────────────────────────
const envFlagIdx = process.argv.indexOf('--env')
const envName = envFlagIdx !== -1 ? process.argv[envFlagIdx + 1] : null
const envFile =
  envName === 'dev'  ? '.env.development' :
  envName === 'prod' ? '.env.production'  : '.env'

// ── Load env file manually ────────────────────────────────────────────────────
try {
  const env = readFileSync(join(root, envFile), 'utf8')
  for (const line of env.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
  console.log(`Using ${envFile}`)
} catch {
  if (envName) {
    console.error(`❌ Could not read ${envFile}. Create it from .env.example.`)
    process.exit(1)
  }
}

// ── Link to the correct project ───────────────────────────────────────────────
const projectRef = process.env.SUPABASE_PROJECT_REF
if (!projectRef) {
  console.error(`❌ SUPABASE_PROJECT_REF is not set in ${envFile}.`)
  console.error('   Find it in Supabase Dashboard → Settings → General → Reference ID')
  process.exit(1)
}

// ── Verify supabase CLI is available ─────────────────────────────────────────
try {
  execSync('supabase --version', { stdio: 'ignore' })
} catch {
  console.error('❌ Supabase CLI not found. Run: npm install -g supabase')
  process.exit(1)
}

console.log(`\nLinking to project ${projectRef}...`)
try {
  execSync(`supabase link --project-ref ${projectRef}`, { stdio: 'inherit', cwd: root })
} catch {
  console.error('❌ Failed to link project. Run `supabase login` first.')
  process.exit(1)
}

// ── Find all function directories ─────────────────────────────────────────────
const functions = readdirSync(functionsDir).filter(name => {
  const full = join(functionsDir, name)
  return statSync(full).isDirectory() && !name.startsWith('_')
})

if (functions.length === 0) {
  console.log('No Edge Functions found in supabase/functions/')
  process.exit(0)
}

console.log(`\n🚀 Deploying ${functions.length} Edge Function(s)...\n`)

let deployed = 0
let failed = 0

for (const fn of functions) {
  process.stdout.write(`  Deploying ${fn}... `)
  try {
    const noJwt = ['get-shared-game', 'ocr-scorecard', 'league-invite', 'site-invite'].includes(fn)
    const cmd = `supabase functions deploy ${fn}${noJwt ? ' --no-verify-jwt' : ''}`
    execSync(cmd, { stdio: 'pipe', cwd: root })
    console.log('✅')
    deployed++
  } catch (err) {
    console.log('❌')
    const msg = err.stderr?.toString() || err.stdout?.toString() || String(err)
    console.error(`    Error: ${msg.trim()}\n`)
    failed++
  }
}

console.log(`\n${deployed} deployed, ${failed} failed.\n`)
if (failed > 0) process.exit(1)
