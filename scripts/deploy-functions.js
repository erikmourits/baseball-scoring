#!/usr/bin/env node
/**
 * Deploy all Supabase Edge Functions.
 *
 * Setup:
 *   1. Install Supabase CLI:  npm install -g supabase
 *   2. Login:                 supabase login
 *   3. Link your project:     supabase link --project-ref <your-project-ref>
 *      (find your ref at: https://supabase.com/dashboard/project/_/settings/general)
 *   4. Set secrets:           supabase secrets set OPENAI_API_KEY=sk-...
 *   5. npm run deploy-functions
 */

import { readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const functionsDir = join(__dirname, '..', 'supabase', 'functions')

// ── Verify supabase CLI is available ─────────────────────────────────────────

try {
  execSync('supabase --version', { stdio: 'ignore' })
} catch {
  console.error('❌ Supabase CLI not found. Run: npm install -g supabase')
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
    execSync(cmd, { stdio: 'pipe' })
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
