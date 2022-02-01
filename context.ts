import { GemRequest } from './request.ts';
import { GemResponse } from './response.ts';
import { send, SendOptions } from './send.ts';

export interface GemContextSendOptions extends SendOptions {
    path?: string,
}

export class GemContext {
    constructor(public request: GemRequest, public response: GemResponse) {

    }

    async send(opts: GemContextSendOptions) {
        const path = opts.path ?? this.request.url.pathname;
        await send(this, path, opts);
    }
}