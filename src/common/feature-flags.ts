// Simple in-memory feature flags placeholder
const flags = new Map<string, boolean>();
export function setFlag(name: string, value: boolean) { flags.set(name, value); }
export function isEnabled(name: string): boolean { return flags.get(name) === true; }
