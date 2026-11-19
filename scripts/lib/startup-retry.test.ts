import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermanentStartupError, startWithRetries } from "./startup-retry.ts";

void describe("browser start-up retries", () => {
  void it("returns the first attempt that succeeds and retries nothing else", async () => {
    const attempts: number[] = [];
    const retried: number[] = [];
    const value = await startWithRetries(
      "Chrome",
      (attempt) => {
        attempts.push(attempt);
        return attempt < 2 ? Promise.reject(new Error("no DevTools port")) : Promise.resolve("connected");
      },
      {
        attempts: 3,
        onRetry: (_error, next) => {
          retried.push(next);
        },
      },
    );
    assert.equal(value, "connected");
    assert.deepEqual(attempts, [1, 2]);
    assert.deepEqual(retried, [2]);
  });

  void it("gives up after the configured attempts and keeps the last failure", async () => {
    const cause = new Error("Chrome exited during startup (1).");
    let calls = 0;
    await assert.rejects(
      startWithRetries(
        "Connecting to Chrome",
        () => {
          calls += 1;
          return Promise.reject(cause);
        },
        { attempts: 3 },
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Connecting to Chrome failed after 3 attempts. Chrome exited during startup (1).");
        assert.equal(error.cause, cause);
        return true;
      },
    );
    assert.equal(calls, 3);
  });

  void it("does not retry a permanent failure, because a new attempt cannot fix a missing executable", async () => {
    let calls = 0;
    await assert.rejects(
      startWithRetries(
        "Connecting to Chrome",
        () => {
          calls += 1;
          return Promise.reject(new PermanentStartupError("Could not start Chrome. Check CHROME_PATH."));
        },
        { attempts: 3 },
      ),
      { name: "PermanentStartupError", message: "Could not start Chrome. Check CHROME_PATH." },
    );
    assert.equal(calls, 1);
  });

  void it("refuses to run with no attempt", async () => {
    await assert.rejects(
      startWithRetries("Chrome", () => Promise.resolve("never"), { attempts: 0 }),
      RangeError,
    );
  });
});
