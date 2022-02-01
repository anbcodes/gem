import { GemContext } from './context.ts';

export type GemMiddleware = (ctx: GemContext, next: () => Promise<unknown>) => void | Promise<unknown>;

/** Compose multiple middleware functions into a single middleware function. */
export function compose(
    middleware: GemMiddleware[],
): (context: GemContext, next?: () => Promise<unknown>) => Promise<unknown> {

    return function composedMiddleware(
        context: GemContext,
        next?: () => Promise<unknown>,
    ): Promise<unknown> {
        let index = -1;

        async function dispatch(i: number): Promise<void> {
            if (i <= index) {
                throw new Error("next() called multiple times.");
            }
            index = i;
            let fn: GemMiddleware | undefined = middleware[i];
            if (i === middleware.length) {
                fn = next;
            }
            if (!fn) {
                return;
            }
            await fn(context, dispatch.bind(null, i + 1));
        }

        return dispatch(0);
    };

}