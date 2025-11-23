// Generic repository contract matching the tenant-aware repositories.
export interface Repository<T> {
	save(entity: T): T;
	getById(tenantId: string, id: string): T | undefined;
}
