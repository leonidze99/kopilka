/**
 * Account lockout: how many failed sign-ins in a row lock an account and
 * for how long. The throttler limits attempts per IP; this limits them per
 * account, which is what an attacker spreading guesses over many addresses
 * gets around.
 *
 * Plain date arithmetic over the state kept on the user row
 * (`failed_login_attempts`, `last_failed_login_at`, `locked_until`), so the
 * policy can be read and unit-tested without a database or a clock.
 */

export interface LockPolicy {
  /** Failures in a row that lock the account. */
  maxFailures: number;
  /** The first lock. Each further failure doubles it, up to `maxLockMinutes`. */
  lockMinutes: number;
  maxLockMinutes: number;
  /**
   * A failure this long after the previous one starts the count again:
   * someone who mistypes a password once a week never gets locked out.
   */
  failureWindowMinutes: number;
}

/** What the user row remembers about failed sign-ins. */
export interface LockState {
  failedLoginAttempts: number;
  lastFailedLoginAt: Date | null;
  lockedUntil: Date | null;
}

/** After a successful sign-in or a password change: nothing held against the account. */
export const NO_FAILURES: LockState = {
  failedLoginAttempts: 0,
  lastFailedLoginAt: null,
  lockedUntil: null,
};

const MINUTE_MS = 60_000;

/** When the account is locked, the moment it opens again; null if it is not. */
export function activeLock(state: LockState, now: Date): Date | null {
  return state.lockedUntil && state.lockedUntil > now
    ? state.lockedUntil
    : null;
}

/**
 * The state after one more failed attempt.
 *
 * Only called when the account is not locked right now: attempts made
 * during a lock are refused without counting, so hammering a known address
 * cannot keep it locked forever. Escalation therefore needs an attacker
 * patient enough to wait out every lock, and the owner is not shut out for
 * longer than one lock (and can reset the password to open it at once).
 */
export function nextFailure(
  state: LockState,
  now: Date,
  policy: LockPolicy,
): LockState {
  const windowStart = now.getTime() - policy.failureWindowMinutes * MINUTE_MS;
  const recent =
    state.lastFailedLoginAt !== null &&
    state.lastFailedLoginAt.getTime() > windowStart;
  const failedLoginAttempts = recent ? state.failedLoginAttempts + 1 : 1;

  if (failedLoginAttempts < policy.maxFailures) {
    return { failedLoginAttempts, lastFailedLoginAt: now, lockedUntil: null };
  }

  // 0 for the first lock, 1 for the next failure after it opens, ...
  const step = failedLoginAttempts - policy.maxFailures;
  const minutes = Math.min(
    policy.lockMinutes * 2 ** step,
    policy.maxLockMinutes,
  );
  return {
    failedLoginAttempts,
    lastFailedLoginAt: now,
    lockedUntil: new Date(now.getTime() + minutes * MINUTE_MS),
  };
}

/** Seconds to put in `Retry-After`; at least 1, so it never reads as "now". */
export const retryAfterSeconds = (lockedUntil: Date, now: Date): number =>
  Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
