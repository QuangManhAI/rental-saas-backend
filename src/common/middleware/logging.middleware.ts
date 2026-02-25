import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const requestId = (req as any).requestId as string | undefined;
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;

      const logData = { requestId, method, url: originalUrl, statusCode, durationMs: duration };

      if (statusCode >= 500) {
        this.logger.error(`${method} ${originalUrl} ${statusCode} (${duration}ms)`, logData);
      } else if (statusCode >= 400) {
        this.logger.warn(`${method} ${originalUrl} ${statusCode} (${duration}ms)`, logData);
      } else {
        this.logger.log(`${method} ${originalUrl} ${statusCode} (${duration}ms)`, logData);
      }
    });

    next();
  }
}
