#!/usr/bin/env node
/**
 * Run the base schema and all pending Supabase migrations.
 *
 * Setup:
 *   1. Add DATABASE_URL to .env.development / .env.production
 *      (Supabase → Settings → Database → Connection string → URI)
 *   2. npm run migrate:dev   (or migrate:prod)
 *
 * Flags:
 *   --env dev   Load .env.development
 *   --env prod  Load .env.production
 *   (default: .env)
 *
 * Execution order:
 *   1. supabase/schema.sql  — base tables, triggers, RLS (idempotent)
 *   2. supabase/migrations/ — numbered migration files in order
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

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
    console.error(`❌  Could not read ${envFile}. Create it from .env.example.`)
    process.exit(1)
  }
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('❌  DATABASE_URL is not set.')
  console.error(`    Add it to ${envFile}:`)
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

async function runSql(file, label) {
  const sql = readFileSync(file, 'utf8')
  try {
    await client.query(sql)
    console.log(`✓ ${label}`)
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('does not exist')) {
      console.log(`~ ${label} (skipped: ${err.message.split('\n')[0]})`)
    } else {
      console.error(`✗ ${label}: ${err.message}`)
      await client.end()
      process.exit(1)
    }
  }
}

// ── 1. Base schema ────────────────────────────────────────────────────────────
const schemaFile = join(root, 'supabase', 'schema.sql')
if (existsSync(schemaFile)) {
  console.log('── Base schema ──────────────────────────────────────')
  await runSql(schemaFile, 'schema.sql')
  console.log()
}

// ── 2. Migrations in order ────────────────────────────────────────────────────
const migrationsDir = join(root, 'supabase', 'migrations')
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.log('No migration files found.')
} else {
  console.log('── Migrations ───────────────────────────────────────')
  for (const file of files) {
    await runSql(join(migrationsDir, file), file)
  }
}

await client.end()
console.log('\nDone.')
