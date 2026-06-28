/**
 * Repository: Audit Logs (§18.9, §19.21)
 */
import { getAuditLogs, saveAuditLog } from "../../db.js";
import type { IAuditLogRepository } from "../../core/interfaces.js";
import type { AuditLog } from "../../types.js";

export class AuditLogRepository implements IAuditLogRepository {
  async findAll(): Promise<AuditLog[]> {
    return getAuditLogs();
  }

  async save(log: AuditLog): Promise<void> {
    await saveAuditLog(log);
  }
}

export const auditLogRepository = new AuditLogRepository();
