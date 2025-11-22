// Placeholder audit logger
interface AuditRecord { at: string; action: string; actor?: string; targetId?: string; tenantId: string; }
const auditRecords: AuditRecord[] = [];
export function audit(action: string, tenantId: string, actor?: string, targetId?: string) {
  auditRecords.push({ at: new Date().toISOString(), action, actor, targetId, tenantId });
}
export function listAuditRecords() { return auditRecords; }
