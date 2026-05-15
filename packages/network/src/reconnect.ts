export interface ReconnectPolicy { timeoutMs: number; maxAttempts: number; backoffMs: number }
export const defaultReconnectPolicy: ReconnectPolicy = { timeoutMs: 60_000, maxAttempts: 5, backoffMs: 500 };
export function nextReconnectDelay(attempt: number, policy = defaultReconnectPolicy): number {
  return Math.min(policy.timeoutMs, policy.backoffMs * 2 ** Math.max(0, attempt - 1));
}
