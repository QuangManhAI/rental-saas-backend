import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

interface MongoServerError extends Error {
  code?: number;
  keyPattern?: Record<string, number>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();
      message =
        typeof errorResponse === 'string'
          ? errorResponse
          : (errorResponse as { message: string | string[] }).message ||
            exception.message;
    } else if (this.isMongoError(exception) && exception.code === 11000) {
      status = HttpStatus.CONFLICT;
      const keys = exception.keyPattern
        ? Object.keys(exception.keyPattern).join(', ')
        : 'field';
      message = `Duplicate value for: ${keys}`;
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private isMongoError(error: unknown): error is MongoServerError {
    return error instanceof Error && 'code' in error;
  }
}
