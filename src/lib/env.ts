import { z } from 'zod'

const EnvSchema = z.object({
  SYNCORE_API_KEY: z.string().min(1),
  SYNCORE_USERNAME: z.string().optional().default(''),
  SYNCORE_PASSWORD: z.string().optional().default(''),
  PICKUP_HMAC_SECRET: z.string().min(16),
  GMAIL_USER: z.string().email(),
  GMAIL_APP_PASSWORD: z.string().optional().default(''),
  PUBLIC_BASE_URL: z.string().url(),
  ADMIN_PASSWORD: z.string().min(1),
  PICKUP_EMAIL_TO: z.string().optional().default(''),
  REP_EMAIL_MAP: z.string().optional().default('')
})

let cached: z.infer<typeof EnvSchema> | null = null

export function env() {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      'Environment validation failed:\n' +
        parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    )
  }
  cached = parsed.data
  return cached
}

/**
 * Parse REP_EMAIL_MAP — comma-separated "Name=email" pairs — into a
 * case-insensitive lookup. Whitespace around names and emails is tolerated.
 */
export function parseRepEmailMap(raw: string): Record<string, string> {
  const map: Record<string, string> = {}
  if (!raw) return map
  for (const pair of raw.split(',')) {
    const [name, email] = pair.split('=').map(s => s?.trim())
    if (name && email) map[name.toLowerCase()] = email
  }
  return map
}

export function lookupRepEmail(name: string | null | undefined): string | null {
  if (!name) return null
  const map = parseRepEmailMap(env().REP_EMAIL_MAP)
  return map[name.toLowerCase()] ?? null
}
