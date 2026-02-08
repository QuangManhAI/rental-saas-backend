export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/rental-saas',
    name: process.env.MONGO_DB || 'rental-saas',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    accessExpiresIn: process.env.JWT_EXPIRATION || '1d',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
  },
  // Cloudflare R2 (S3-compatible)
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'excel-rental',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },
  // Telegram Bot (only botToken needed - chatIds come from customer records)
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
});
