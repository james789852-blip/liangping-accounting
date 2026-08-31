import 'server-only'

export const DATA_MIGRATION_MODES = [
  'supabase-only',
  'shadow-read',
  'dual-write',
  'firebase-primary',
] as const

export type DataMigrationMode = (typeof DATA_MIGRATION_MODES)[number]

export type MigrationConfig = {
  mode: DataMigrationMode
  firebaseProjectId: string | null
  firebaseEnvironment: 'staging' | 'production'
  readsFromFirebase: boolean
  writesToFirebase: boolean
  primaryBackend: 'supabase' | 'firebase'
}

const WRITE_CONFIRMATION = 'ENABLE_FIREBASE_MIGRATION_WRITES'
const PRODUCTION_CONFIRMATION = 'ALLOW_PRODUCTION_MIGRATION'
const CUTOVER_CONFIRMATION = 'CUTOVER_TO_FIREBASE_PRIMARY'

function parseMode(value: string | undefined): DataMigrationMode {
  const mode = value?.trim() || 'supabase-only'
  if (!DATA_MIGRATION_MODES.includes(mode as DataMigrationMode)) {
    throw new Error(`Unknown DATA_MIGRATION_MODE: ${mode}`)
  }
  return mode as DataMigrationMode
}

function parseFirebaseEnvironment(
  value: string | undefined
): 'staging' | 'production' {
  const environment = value?.trim() || 'staging'
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error(`Unknown FIREBASE_MIGRATION_ENV: ${environment}`)
  }
  return environment
}

/**
 * Server-only migration guard.
 *
 * Merely setting these environment variables does not implement replication.
 * Callers must use this guard when the Firebase adapter is introduced. The
 * deliberately verbose confirmations prevent an accidental production switch.
 */
export function getMigrationConfig(): MigrationConfig {
  const mode = parseMode(process.env.DATA_MIGRATION_MODE)
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim() || null
  const firebaseEnvironment = parseFirebaseEnvironment(
    process.env.FIREBASE_MIGRATION_ENV
  )
  const isProductionRuntime =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  if (mode !== 'supabase-only' && !firebaseProjectId) {
    throw new Error('FIREBASE_PROJECT_ID is required outside supabase-only mode')
  }

  const writesToFirebase = mode === 'dual-write' || mode === 'firebase-primary'

  if (
    writesToFirebase &&
    process.env.MIGRATION_WRITE_CONFIRMATION !== WRITE_CONFIRMATION
  ) {
    throw new Error(
      `Firebase writes are locked. Set MIGRATION_WRITE_CONFIRMATION=${WRITE_CONFIRMATION}`
    )
  }

  if (
    isProductionRuntime &&
    mode !== 'supabase-only' &&
    process.env.MIGRATION_PRODUCTION_CONFIRMATION !== PRODUCTION_CONFIRMATION
  ) {
    throw new Error(
      `Production migration is locked. Set MIGRATION_PRODUCTION_CONFIRMATION=${PRODUCTION_CONFIRMATION}`
    )
  }

  if (
    mode === 'firebase-primary' &&
    process.env.MIGRATION_CUTOVER_CONFIRMATION !== CUTOVER_CONFIRMATION
  ) {
    throw new Error(
      `Firebase cutover is locked. Set MIGRATION_CUTOVER_CONFIRMATION=${CUTOVER_CONFIRMATION}`
    )
  }

  if (mode === 'firebase-primary' && firebaseEnvironment !== 'production') {
    throw new Error('firebase-primary cannot target a staging Firebase project')
  }

  return {
    mode,
    firebaseProjectId,
    firebaseEnvironment,
    readsFromFirebase: mode !== 'supabase-only',
    writesToFirebase,
    primaryBackend: mode === 'firebase-primary' ? 'firebase' : 'supabase',
  }
}
