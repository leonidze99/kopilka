import {
  activeLock,
  type LockPolicy,
  type LockState,
  NO_FAILURES,
  nextFailure,
  retryAfterSeconds,
} from './login-lock.js';

const policy: LockPolicy = {
  maxFailures: 10,
  lockMinutes: 5,
  maxLockMinutes: 60,
  failureWindowMinutes: 60,
};

const now = new Date('2026-10-13T12:00:00Z');
const minutesAfter = (minutes: number, from = now) =>
  new Date(from.getTime() + minutes * 60_000);

/** The state after `count` failures, the last one `now`. */
const after = (count: number, state: LockState = NO_FAILURES): LockState => {
  let current = state;
  for (let i = 0; i < count; i++) current = nextFailure(current, now, policy);
  return current;
};

describe('login lock', () => {
  describe('nextFailure', () => {
    it('counts failures without locking below the limit', () => {
      const state = after(9);
      expect(state.failedLoginAttempts).toBe(9);
      expect(state.lockedUntil).toBeNull();
      expect(state.lastFailedLoginAt).toEqual(now);
    });

    it('locks on the failure that reaches the limit', () => {
      expect(after(10).lockedUntil).toEqual(minutesAfter(5));
    });

    it.each([
      [10, 5],
      [11, 10],
      [12, 20],
      [13, 40],
      // Capped: an attacker patient enough cannot lock an account out for a day.
      [14, 60],
      [20, 60],
    ])('failure %i locks the account for %i minutes', (failures, minutes) => {
      expect(after(failures).lockedUntil).toEqual(minutesAfter(minutes));
    });

    it('starts the count again after a quiet window', () => {
      const old: LockState = {
        failedLoginAttempts: 9,
        lastFailedLoginAt: minutesAfter(-61),
        lockedUntil: null,
      };
      expect(nextFailure(old, now, policy).failedLoginAttempts).toBe(1);
    });

    it('keeps counting a failure inside the window', () => {
      const recent: LockState = {
        failedLoginAttempts: 9,
        lastFailedLoginAt: minutesAfter(-59),
        lockedUntil: null,
      };
      expect(nextFailure(recent, now, policy).failedLoginAttempts).toBe(10);
    });
  });

  describe('activeLock', () => {
    it('is null without a lock', () => {
      expect(activeLock(NO_FAILURES, now)).toBeNull();
    });

    it('holds while the lock lasts and opens the account after it', () => {
      const locked = after(10);
      expect(activeLock(locked, now)).toEqual(minutesAfter(5));
      expect(activeLock(locked, minutesAfter(4))).toEqual(minutesAfter(5));
      // The moment it expires the account is open again, with the count kept:
      // one more failure escalates instead of starting over.
      expect(activeLock(locked, minutesAfter(5))).toBeNull();
    });
  });

  describe('retryAfterSeconds', () => {
    it('rounds up', () => {
      expect(retryAfterSeconds(new Date(now.getTime() + 1500), now)).toBe(2);
    });

    it('never says zero', () => {
      expect(retryAfterSeconds(now, now)).toBe(1);
    });
  });
});
