/**
 * Rich server-side logging for Vercel / Node so runtime logs include
 * message, stack, and Error.cause chains (not sent to clients).
 */
export type SerializedError = {
  name?: string;
  message: string;
  stack?: string;
  cause?: SerializedError | string;
  aggregateErrors?: SerializedError[];
  nonErrorPayload?: string;
};

export function serializeError(err: unknown, depth = 0): SerializedError | string {
  if (depth > 10) return "[max error depth]";
  if (err == null) return { message: String(err) };
  if (typeof err === "string") return { message: err };

  if (err instanceof Error) {
    const out: SerializedError = {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause !== undefined && cause !== null) {
      out.cause =
        cause instanceof Error ? (serializeError(cause, depth + 1) as SerializedError) : { message: String(cause) };
    }
    if (typeof AggregateError !== "undefined" && err instanceof AggregateError && err.errors?.length) {
      out.aggregateErrors = err.errors.map((e) => serializeError(e, depth + 1) as SerializedError);
    }
    return out;
  }

  if (typeof err === "object") {
    try {
      return { message: JSON.stringify(err), nonErrorPayload: JSON.stringify(err) };
    } catch {
      return { message: String(err) };
    }
  }

  return { message: String(err) };
}

/** Logs structured JSON plus the raw Error so Vercel captures stacks. */
export function logServerError(scope: string, err: unknown) {
  const serialized = serializeError(err);
  console.error(`[${scope}] serialized:`, JSON.stringify(serialized, null, 2));
  if (err instanceof Error) {
    console.error(`[${scope}] native:`, err);
  } else {
    console.error(`[${scope}] value:`, err);
  }
}
