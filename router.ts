import { GemContext } from './context.ts';

import { pathMatch, MatchFunction } from './deps.ts';

export interface GemRouterOptions {
    /**
     * The url must begin with the url prefix before any routes are checked against
     * 
     * @example
     * ```ts
     * import { GemRouter } from 'https://deno.land/x/gem/mod.ts';
     * 
     * const router = new GemRouter({ urlPrefix: 'gemini://localhost' });
     * 
     * router.on('/user/:id', (ctx) => console.log(ctx.params.id)) // Matches gemini://localhost/user/[id]
     * 
     * ```
     */
    urlPrefix: string,

    /**
     * A prefix to be appended before all the routes
     */
    prefix?: string,
}

export type MatchParamsObject = { [key: string]: string };

export class GemRouterContext extends GemContext {
    public params: Record<string, string>;
    constructor(context: GemContext, params: MatchParamsObject) {
        super(context.request, context.response);
        this.params = params;
    }
}

export type GemRouterHandler = (ctx: GemRouterContext) => Promise<unknown> | unknown;


export class GemRouter {
    public readonly urlPrefix: string;
    public readonly prefix: string;
    private registeredRoutes: [MatchFunction<object>, GemRouterHandler][] = [];

    constructor(options: GemRouterOptions) {
        this.urlPrefix = options.urlPrefix;
        this.prefix = options.prefix || '';
    }

    public on(route: string, handler: GemRouterHandler) {
        this.registeredRoutes.push([pathMatch(this.prefix + route, { decode: decodeURIComponent }), handler]);
    }

    public routes() {
        return (ctx: GemContext) => {
            const raw = ctx.request.raw;
            if (raw.startsWith(this.urlPrefix)) {
                for (const [match, func] of this.registeredRoutes) {
                    let amatch = match(ctx.request.url.pathname);
                    if (amatch) {
                        func(new GemRouterContext(ctx, amatch.params as MatchParamsObject));
                    }
                }
            }
        }
    }
}