declare module 'sql.js' {
  export interface SqlJsConfig {
    locateFile?: (fileName: string) => string;
  }

  export interface Database {
    prepare(sql: string): {
      bind(values: Record<string, unknown> | unknown[]): void;
      step(): boolean;
      getAsObject(): Record<string, unknown>;
      free(): void;
    };
    export(): Uint8Array;
    exec(sql: string): void;
    close(): void;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<{ Database: new (data?: Uint8Array) => Database }>;
}
