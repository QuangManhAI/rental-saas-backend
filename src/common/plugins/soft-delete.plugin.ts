import { Document, Model, Schema, Types } from 'mongoose';

/**
 * Interface for documents that support soft deletion.
 * Add this to your HydratedDocument type when applying the plugin.
 */
export interface SoftDeleteFields {
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  softDelete(deletedBy?: string | Types.ObjectId): Promise<void>;
}

/**
 * Interface for models that expose a findDeleted() static method.
 */
export type SoftDeleteModel<T extends Document> = Model<T> & {
  findDeleted(filter?: Record<string, unknown>): ReturnType<Model<T>['find']>;
};

/**
 * Mongoose plugin: adds soft-delete behaviour to a schema.
 *
 * What it does:
 * - Adds isDeleted / deletedAt / deletedBy fields.
 * - Automatically excludes soft-deleted docs from find / findOne /
 *   countDocuments queries unless the caller explicitly filters on isDeleted.
 * - Adds an instance method `softDelete(deletedBy?)` to mark a doc as deleted.
 * - Adds a static method `findDeleted(filter?)` to retrieve deleted docs.
 */
export function softDeletePlugin(schema: Schema): void {
  // --- Fields -----------------------------------------------------------------
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Types.ObjectId, ref: 'User', default: null },
  });

  // --- Query middleware --------------------------------------------------------
  // Only inject the filter when the caller has NOT explicitly set isDeleted.
  // This allows findDeleted() and restore queries to work without being blocked.
  const excludeDeleted = function (this: ReturnType<Model<Document>['find']>) {
    const filter = (this as any).getFilter() as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(filter, 'isDeleted')) {
      (this as any).where({ isDeleted: { $ne: true } });
    }
  };

  schema.pre('find', excludeDeleted);
  schema.pre('findOne', excludeDeleted);
  schema.pre('countDocuments', excludeDeleted);

  // --- Instance method --------------------------------------------------------
  schema.methods.softDelete = async function (
    deletedBy?: string | Types.ObjectId,
  ): Promise<void> {
    this.isDeleted = true;
    this.deletedAt = new Date();
    if (deletedBy) {
      this.deletedBy =
        typeof deletedBy === 'string'
          ? new Types.ObjectId(deletedBy)
          : deletedBy;
    }
    await (this as Document).save();
  };

  // --- Static method ----------------------------------------------------------
  schema.statics.findDeleted = function (
    filter: Record<string, unknown> = {},
  ) {
    return (this as Model<Document>).find({ ...filter, isDeleted: true });
  };
}
