// Generic repository interface for future Cosmos DB implementation.
export interface Repository<T> { save(entity: T): T; get(id: string): T | undefined; }
