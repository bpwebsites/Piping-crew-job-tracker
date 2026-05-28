import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ─── Rate limiting (in-memory, best-effort; resets on cold start) ─── */
const _attempts = new Map<string, number[]>()
const RATE = { max: 10, windowMs: 15 * 60 * 1000 }

function checkRate(ip: string): boolean {
  const now = Date.now()
  const times = (_attempts.get(ip) ?? []).filter(t => now - t < RATE.windowMs)
  if (times.length >= RATE.max) return false
  times.push(now)
  _attempts.set(ip, times)
  return true
}

/* ─── Constant-time string comparison (prevents timing attacks) ─── */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still iterate to avoid length-based timing leak
    let diff = 1
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0)
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* ─── CORS ─── */
const ALLOWED_ORIGINS = new Set([
  'https://crewtimeline.netlify.app',
])

function corsHeaders(origin: string | null): Record<string, string> {
  // Allow the production origin; allow null (file://) only in dev
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://crewtimeline.netlify.app'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

/* ─── Handler ─── */
serve(async (req: Request) => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (req.method !== 'POST') {
    return json({ valid: false, error: 'Method not allowed' }, 405, origin)
  }

  // IP-based rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown'

  if (!checkRate(ip)) {
    return json({ valid: false, error: 'Too many attempts. Try again later.' }, 429, origin)
  }

  let code: unknown
  try {
    const body = await req.json()
    code = body?.code
  } catch {
    return json({ valid: false }, 400, origin)
  }

  // Input validation — never trust the client
  if (typeof code !== 'string' || code.length === 0 || code.length > 200) {
    return json({ valid: false }, 400, origin)
  }

  // Read the stored code using the service role key (never leaves the server)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'lead_code')
    .single()

  if (error || !data?.value) {
    // Don't leak whether the row exists or not
    return json({ valid: false }, 200, origin)
  }

  const valid = safeEqual(data.value, code.trim())

  // Always return 200 — status codes leak whether the code was close
  return json({ valid }, 200, origin)
})
