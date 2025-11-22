export interface AppConfig { apiKey: string; }
export function loadConfig(): AppConfig {
  return { apiKey: process.env.API_KEY || 'dev-key' };
}
