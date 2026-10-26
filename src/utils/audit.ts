import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../config/prisma';

type Db = PrismaClient | Prisma.TransactionClient;
type Scalar = string | number | boolean | null;

export interface AuditEntry {
  actorUserId: number | null;
  action: string;          // e.g. "employee.update"
  entity: string;          // e.g. "Employee"
  entityId: string | number;
  changes?: Prisma.InputJsonValue;
  ip?: string | null;
}

// Pass the transaction client (tx) so the log is saved together with the change
export function logAudit(entry: AuditEntry, db: Db = prisma) {
  return db.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entity: entry.entity,
      entityId: String(entry.entityId),
      changes: entry.changes,
      ip: entry.ip ?? null,
    },
  });
}

const REDACTED_FIELDS = new Set(['bankAccountNumber', 'passwordHash']);

function normalize(value: unknown): Scalar {
  if (value instanceof Date) return value.toISOString();
  return (value ?? null) as Scalar;
}

// Returns only the fields that actually changed: { field: { from, to } }
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: Scalar; to: Scalar }> = {};
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    const from = normalize(before[key]);
    const to = normalize(after[key]);
    if (from !== to) {
      changes[key] = REDACTED_FIELDS.has(key) ? { from: '[redacted]', to: '[redacted]' } : { from, to };
    }
  }
  return changes;
}