import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './audit-log.schema';

// interface for the audit log entry, controlling what fields are required when logging an action.
export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string;
  userId: string;
  ownerId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  /**
   * Write an audit log entry asynchronously.
   * Errors are caught and logged — never propagated to callers.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.auditLogModel.create({
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId
          ? new Types.ObjectId(entry.entityId)
          : undefined,
        userId: new Types.ObjectId(entry.userId),
        ownerId: new Types.ObjectId(entry.ownerId),
        changes: entry.changes,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  async findByOwner(
    ownerId: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: AuditLogDocument[]; total: number; page: number }> {
    const filter = { ownerId: new Types.ObjectId(ownerId) };
    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return { data: data as AuditLogDocument[], total, page };
  }
}
