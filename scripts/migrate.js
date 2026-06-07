#!/usr/bin/env node
/**
 * Run all pending Supabase migrations.
 *
 * Setup:
 *   1. Add DATABASE_URL to your .env file
 *      (Supabase → Settings → Database → Connection string → URI)
 *   2. npm run migrate
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// ── Load .env manually (no extra dep needed) ─────────────────────────────────
try {
  const env = readFileSync(join(root, '.env'), 'utf8')
  for (const line of env.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
} catch {
  // .env not found — rely on environment variables already set
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('❌  DATABASE_URL is not set.')
  console.error('    Add it to your .env file:')
  console.error('    DATABASE_URL=postgresql://postgres.[ref]:[password]@[host]:5432/postgres')
  console.error('    (Supabase → Settings → Database → Connection string → URI)')
  process.exit(1)
}

// ── Connect ───────────────────────────────────────────────────────────────────
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
console.log('✓ Connected\n')

// ── Run migrations in order ───────────────────────────────────────────────────
const migrationsDir = join(root, 'supabase', 'migrations')
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.log('No migration files found.')
} else {
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    try {
      await client.query(sql)
      console.log(`✓ ${file}`)
    } catch (err) {
      // Ignore "already exists" errors so migrations are safe to re-run
      if (err.message.includes('already exists') || err.message.includes('does not exist')) {
        console.log(`~ ${file} (skipped: ${err.message.split('\n')[0]})`)
      } else {
        console.error(`✗ ${file}: ${err.message}`)
        await client.end()
        process.exit(1)
      }
    }
  }
}

await client.end()
console.log('\nDone.')
