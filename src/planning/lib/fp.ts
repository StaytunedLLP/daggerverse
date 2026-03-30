/**
 * fp.ts
 *
 * core functional programming primitives for sync-issues.
 */

/**
 * Result type for representing success or failure.
 */
export type Result<E, T> =
    | { readonly _tag: "Success"; readonly value: T }
    | { readonly _tag: "Failure"; readonly error: E };

export const success = <T>(value: T): Result<never, T> => ({
    _tag: "Success",
    value,
});

export const failure = <E>(error: E): Result<E, never> => ({
    _tag: "Failure",
    error,
});

export const ok = success;
export const err = failure;

export const isSuccess = <E, T>(result: Result<E, T>): result is { readonly _tag: "Success"; readonly value: T } =>
    result._tag === "Success";

export const isFailure = <E, T>(result: Result<E, T>): result is { readonly _tag: "Failure"; readonly error: E } =>
    result._tag === "Failure";

/**
 * map: (T -> U) -> Result<E, T> -> Result<E, U>
 */
export const map = <T, U>(f: (t: T) => U) => <E>(result: Result<E, T>): Result<E, U> =>
    isSuccess(result) ? success(f(result.value)) : result;

/**
 * flatMap: (T -> Result<EE, U>) -> Result<E, T> -> Result<E | EE, U>
 */
export const flatMap = <T, EE, U>(f: (t: T) => Result<EE, U>) => <E>(result: Result<E, T>): Result<E | EE, U> =>
    isSuccess(result) ? f(result.value) : (result as any);

/**
 * Task type for representing async operations that return a Result.
 */
export type Task<E, T> = () => Promise<Result<E, T>>;

export const task = {
    of: <T>(value: T): Task<never, T> => async () => success(value),
    fromPromise: <E, T>(promise: Promise<T>, onError: (e: unknown) => E): Task<E, T> => async () => {
        try {
            const value = await promise;
            return success(value);
        } catch (e) {
            return failure(onError(e));
        }
    },
};

/**
 * Option type for representing optional values.
 */
export type Option<T> =
    | { readonly _tag: "Some"; readonly value: T }
    | { readonly _tag: "None" };

export const some = <T>(value: T): Option<T> => ({ _tag: "Some", value });
export const none: Option<never> = { _tag: "None" };

export const isSome = <T>(option: Option<T>): option is { readonly _tag: "Some"; readonly value: T } =>
    option._tag === "Some";

export const isNone = <T>(option: Option<T>): option is { readonly _tag: "None" } =>
    option._tag === "None";

/**
 * Functional pipe helper.
 */
export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe<A, B, C, D, E>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E): E;
export function pipe<A, B, C, D, E, F>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E, ef: (e: E) => F): F;
export function pipe<A, B, C, D, E, F, G>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E, ef: (e: E) => F, fg: (f: F) => G): G;
export function pipe<A, B, C, D, E, F, G, H>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E, ef: (e: E) => F, fg: (f: F) => G, gh: (g: G) => H): H;
export function pipe(a: unknown, ...fns: Array<(arg: unknown) => unknown>): unknown {
    return fns.reduce((acc, fn) => fn(acc), a);
}
