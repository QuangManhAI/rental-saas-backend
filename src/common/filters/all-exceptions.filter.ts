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

/** User-friendly Vietnamese messages keyed by HTTP status. */
const VI_MESSAGES: Record<number, string> = {
  400: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  402: 'Bạn đã đạt giới hạn gói hiện tại. Vui lòng nâng cấp để tiếp tục.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy tài nguyên yêu cầu.',
  409: 'Dữ liệu đã tồn tại. Vui lòng kiểm tra lại.',
  422: 'Dữ liệu không thể xử lý. Vui lòng kiểm tra lại.',
  429: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
  500: 'Có lỗi xảy ra trên máy chủ. Vui lòng thử lại sau.',
  503: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = VI_MESSAGES[500];
    let errorCode = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();

      const rawMessage =
        typeof errorResponse === 'string'
          ? errorResponse
          : (errorResponse as { message: string | string[] }).message ||
            exception.message;

      // Use the service's original message (already user-friendly)
      message = rawMessage ?? VI_MESSAGES[status] ?? 'Lỗi không xác định.';
      errorCode = HttpStatus[status] ?? 'HTTP_ERROR';

      if (status >= 500) {
        this.logger.error(
          `[${requestId}] ${request.method} ${request.url} → ${status}: ${JSON.stringify(rawMessage)}`,
          exception instanceof Error ? exception.stack : undefined,
        );
      } else {
        this.logger.warn(
          `[${requestId}] ${request.method} ${request.url} → ${status}: ${JSON.stringify(rawMessage)}`,
        );
      }
    } else if (this.isMongoError(exception) && exception.code === 11000) {
      status = HttpStatus.CONFLICT;
      const keys = exception.keyPattern
        ? Object.keys(exception.keyPattern).join(', ')
        : 'field';
      message = `Dữ liệu đã tồn tại (${keys}). Vui lòng kiểm tra lại.`;
      errorCode = 'DUPLICATE_KEY';
      this.logger.warn(
        `[${requestId}] MongoDB duplicate key: ${exception.message}`,
      );
    } else if (exception instanceof Error) {
      // Unexpected non-HTTP error — log full stack, expose generic message only
      this.logger.error(
        `[${requestId}] Unhandled ${exception.constructor.name}: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `[${requestId}] Unknown exception type`,
        String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: errorCode,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  private isMongoError(error: unknown): error is MongoServerError {
    return error instanceof Error && 'code' in error;
  }
}
