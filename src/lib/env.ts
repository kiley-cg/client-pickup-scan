import { z } from 'zod'

const EnvSchema = z.object({
  SYNCORE_API_KEY: z.string().min(1),
  PICKUP_HMAC_SECRET: z.string().min(16),
  GMAIL_USER: z.string().email(),
  GMAIL_APP_PASSWORD: z.string().optional().default(''),
  PUBLIC_BASE_URL: z.string().url(),
  ADMIN_PASSWORD: z.string().min(1),
  REP_EMAIL_MAP: z.string().optional().default(''),
  CSR_FALLBACK_EMAIL: z.string().optional().default('')
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

export function parseRepEmailMap(raw: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [name, email] = pair.split('=').map(s => s?.trim())
    if (name && email) map[name.toLowerCase()] = email
  }
  return map
}
