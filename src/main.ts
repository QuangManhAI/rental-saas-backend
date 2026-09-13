import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { winstonConfig } from './config/winston.config';

async function bootstrap() {
  const winstonLogger = WinstonModule.createLogger(winstonConfig);
  const app = await NestFactory.create(AppModule, { logger: winstonLogger });
  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api');

  // URI versioning — all routes become /api/v{N}/...
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // CORS — must be registered BEFORE helmet to handle OPTIONS preflight
  const allowedOriginsEnv = configService.get<string>('cors.allowedOrigins', '');
  const origins = allowedOriginsEnv
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    winstonLogger.warn(
      'ALLOWED_ORIGINS is not set. Defaulting to http://localhost:3001 (development only). ' +
      'Set this to your production domain before deploying.',
      'Bootstrap',
    );
    origins.push('http://localhost:3001');
  }

  app.enableCors({
    // Reflect the request origin instead of returning a literal "*".
    // Returning `Access-Control-Allow-Origin: *` together with
    // `Access-Control-Allow-Credentials: true` is a spec violation that
    // browsers reject, which silently blocks cross-origin requests.
    origin: (origin, callback) => {
      if (!origin || origins.includes('*') || origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type,Authorization,Accept',
  });

  // HTTP security headers — after CORS so preflight is not blocked
  app.use(helmet({ crossOriginResourcePolicy: false }));
 
  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Response interceptor
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');

  console.log('Listening on port:', port);

  winstonLogger.log(`Application running on port ${port}`, 'Bootstrap');
  winstonLogger.log(`CORS allowed origins: ${origins.join(', ')}`, 'Bootstrap');
  console.log('ENV RAW:', process.env.ALLOWED_ORIGINS);
  console.log('CONFIG VALUE:', configService.get('cors.allowedOrigins'));
}
bootstrap();
