import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  APP_URL: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(8),
  /**
   * Number of trusted reverse-proxy hops in front of the API (e.g. 1 behind a
   * single load balancer). Default 0: X-Forwarded-For is ignored, so clients
   * cannot spoof their IP to evade rate limits.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Requests per IP per 5 minutes across the whole API. */
  RATE_LIMIT_API: z.coerce.number().int().min(50).default(600),
  /** Sign-in / registration / reset attempts per IP per 15 minutes. Default: 30 in production, 300 elsewhere. */
  AUTH_ATTEMPTS_PER_IP: z.coerce.number().int().min(5).optional(),
  /** Failed sign-ins allowed per account per 15 minutes (any IP). */
  LOGIN_FAILURES_PER_ACCOUNT: z.coerce.number().int().min(3).default(10),
  /** Set once an email provider is wired for password resets. */
  EMAIL_PROVIDER: z.string().optional(),
  /** Google Gemini (Dhaaga Bazaar AI Studio). Server-side only — never exposed to the browser. */
  GEMINI_API_KEY: z.string().optional(),
  /** Image-editing model (image + text in, image out). */
  GEMINI_IMAGE_MODEL: z.string().default('gemini-nano-banana-2.1'),
  /** Vision model used to analyse the garment photo before editing. */
  GEMINI_ANALYSIS_MODEL: z.string().default('gemini-3.6-flash'),
  /** Output size requested from the image model: 1K, 2K or 4K. */
  GEMINI_IMAGE_SIZE: z.enum(['1K', '2K', '4K']).default('2K'),
  /** Per-request timeout for Gemini calls. Generation is never retried automatically. */
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  /** Usage caps per supplier per day (cost protection). */
  AI_DAILY_GENERATIONS: z.coerce.number().int().min(0).default(20),
  AI_DAILY_ANALYSES: z.coerce.number().int().min(0).default(60),
  /**
   * Local Docker testing only: lets NODE_ENV=production run on http://localhost. Relaxes ONLY
   * the localhost-origin and https-URL checks (the JWT secret check stays). Never set on a server.
   */
  ALLOW_INSECURE_LOCALHOST: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  ENABLE_DEV_FIXTURES: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid server configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

if (env.NODE_ENV === 'production') {
  const fatal: string[] = [];
  if (/change-me|test-secret/i.test(env.JWT_SECRET) || env.JWT_SECRET.length < 48) fatal.push('JWT_SECRET must be a unique random value of at least 48 characters.');
  if (env.ALLOW_INSECURE_LOCALHOST) {
    const local = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(u);
    if (!env.CLIENT_ORIGIN.split(',').every((o) => local(o.trim())) || !local(env.APP_URL)) {
      fatal.push('ALLOW_INSECURE_LOCALHOST only allows localhost origins. Remove it and use your https domain.');
    }
    console.warn('[config] ALLOW_INSECURE_LOCALHOST=true — production mode on localhost for local testing only.');
  } else {
    if (/localhost|127\.0\.0\.1/.test(env.CLIENT_ORIGIN)) fatal.push('CLIENT_ORIGIN must be the public https origin, not localhost.');
    if (!env.APP_URL.startsWith('https://')) fatal.push('APP_URL must be an https URL in production.');
  }
  if (fatal.length) {
    console.error(`Refusing to start in production:\n - ${fatal.join('\n - ')}`);
    process.exit(1);
  }
  if (!env.EMAIL_PROVIDER) console.warn('[config] EMAIL_PROVIDER is not configured: password-reset emails cannot be delivered.');
}

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  port: env.PORT,
  clientOrigins: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  appUrl: env.APP_URL.replace(/\/$/, ''),
  jwtSecret: env.JWT_SECRET,
  sessionDays: env.SESSION_DAYS,
  storageDriver: env.STORAGE_DRIVER,
  uploadDir: env.UPLOAD_DIR,
  maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  trustProxy: env.TRUST_PROXY,
  rateLimitApi: env.RATE_LIMIT_API,
  loginFailuresPerAccount: env.LOGIN_FAILURES_PER_ACCOUNT,
  authAttemptsPerIp: env.AUTH_ATTEMPTS_PER_IP ?? (env.NODE_ENV === 'production' ? 30 : env.NODE_ENV === 'test' ? 1000 : 300),
  emailConfigured: !!env.EMAIL_PROVIDER,
  ai: {
    apiKey: env.GEMINI_API_KEY?.trim() && !/^CHANGE_ME$/i.test(env.GEMINI_API_KEY.trim()) ? env.GEMINI_API_KEY.trim() : null,
    imageModel: env.GEMINI_IMAGE_MODEL,
    analysisModel: env.GEMINI_ANALYSIS_MODEL,
    imageSize: env.GEMINI_IMAGE_SIZE,
    timeoutMs: env.GEMINI_TIMEOUT_MS,
    dailyGenerations: env.AI_DAILY_GENERATIONS,
    dailyAnalyses: env.AI_DAILY_ANALYSES,
  },
  /** Fixtures can NEVER be visible in production, regardless of the flag. */
  fixturesVisible: env.NODE_ENV !== 'production' && env.ENABLE_DEV_FIXTURES,
} as const;
