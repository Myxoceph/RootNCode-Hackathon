/**
 * Hedged calls to a provider that now and then holds a request for good while the next one is
 * answered at once (EVREN): a late call gets company instead of being waited for.
 */

export interface HedgeOptions {
  /** When the call goes out, in ms from the first: [0, 2500, 6000] sends up to three. */
  starts: number[];
  /** All calls end by then. */
  deadlineMs: number;
  /** The provider's own failures, which another call may not have; anything else is our bug. */
  retryable: (err: unknown) => boolean;
  /** The error when nothing answered by the deadline. */
  timedOut: () => unknown;
}

/**
 * `call` sent once at each of `starts`, unless an earlier one has answered: the first answer
 * wins and the others are cancelled. A call that fails sends the next one at once. Fails with
 * the last provider error when all failed or the deadline passed (`timedOut()` if none
 * answered at all); an error that is not `retryable` is thrown at once.
 */
export function hedge<T>(call: (signal: AbortSignal) => Promise<T>, { starts, deadlineMs, retryable, timedOut }: HedgeOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controllers: AbortController[] = [];
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    let settled = false;
    let launched = 0;
    let failed = 0;
    let last: unknown = timedOut();
    const deadline = setTimeout(() => settle(() => reject(last)), deadlineMs);
    function settle(finish: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      timers.forEach(clearTimeout);
      controllers.forEach((controller) => controller.abort());
      finish();
    }
    function launch() {
      if (settled || launched === starts.length) return;
      clearTimeout(timers.get(launched));
      launched += 1;
      const controller = new AbortController();
      controllers.push(controller);
      call(controller.signal).then(
        (value) => settle(() => resolve(value)),
        (err: unknown) => {
          if (!retryable(err)) return settle(() => reject(err));
          last = err;
          failed += 1;
          if (failed === starts.length) settle(() => reject(last));
          else launch();
        },
      );
    }
    // A call sent early, after a failure, is not sent again when its time comes.
    starts.forEach((at, i) => timers.set(i, setTimeout(() => launched === i && launch(), at)));
  });
}
