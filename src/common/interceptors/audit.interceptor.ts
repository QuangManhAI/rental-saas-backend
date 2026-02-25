import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { AuditService } from '../../modules/audit/audit.service';

/** HTTP methods that represent mutating operations worth auditing. */
const AUDIT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** URL segment → entity name mapping. */
const ENTITY_MAP: Record<string, string> = {
  bills: 'Bill',
  payments: 'Payment',
  contracts: 'Contract',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: { userId: string; ownerId: string } }
    >();

    const { method, url, ip, headers, user } = request;

    if (!AUDIT_METHODS.has(method.toUpperCase()) || !user) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseBody) => {
        const action = this.resolveAction(method, url);
        const entity = this.resolveEntity(url);
        const entityId = this.resolveEntityId(url, responseBody as Record<string, unknown>);

        // Fire-and-forget: audit logging must never delay or break the response.
        this.auditService
          .log({
            action,
            entity,
            entityId,
            userId: user.userId,
            ownerId: user.ownerId,
            changes: this.sanitizeBody(responseBody),
            ipAddress: ip,
            userAgent: String(headers['user-agent'] ?? ''),
          })
          .catch(() => undefined); // errors already logged inside AuditService
      }),
    );
  }

  private resolveAction(method: string, url: string): string {
    if (url.includes('/restore')) return 'RESTORE';
    switch (method.toUpperCase()) {
      case 'POST':
        return 'CREATE';
      case 'PUT':
      case 'PATCH':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      default:
        return method.toUpperCase();
    }
  }

  private resolveEntity(url: string): string {
    const segments = url.split('/').filter(Boolean);
    for (const segment of segments) {
      if (ENTITY_MAP[segment]) return ENTITY_MAP[segment];
    }
    return segments[1] ?? 'Unknown';
  }

  private resolveEntityId(
    url: string,
    body: Record<string, unknown> | null | undefined,
  ): string | undefined {
    // Prefer _id from the response body (reliable for CREATE)
    if (body && typeof body._id === 'string') return body._id;
    if (body && body._id && typeof body._id === 'object') {
      return String(body._id);
    }
    // Fall back to ObjectId found in the URL (for DELETE / PATCH /:id)
    const match = url.match(/\/([a-f0-9]{24})/i);
    return match ? match[1] : undefined;
  }

  /** Strip large or sensitive fields before persisting. */
  private sanitizeBody(
    body: unknown,
  ): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const obj = body as Record<string, unknown>;
    // Omit top-level keys that look like binary blobs or are too large
    const omit = new Set(['__v', 'password', 'refreshToken']);
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!omit.has(k)) sanitized[k] = v;
    }
    return sanitized;
  }
}
