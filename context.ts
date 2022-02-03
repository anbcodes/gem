import { GemRequest } from './request.ts';
import { GemResponse } from './response.ts';
import { send, SendOptions } from './send.ts';
import { readAll } from './deps.ts';

const CARRAGE_RETURN = '\r'.charCodeAt(0);
const NEW_LINE = '\n'.charCodeAt(0);

export interface GemContextSendOptions extends SendOptions {
    path?: string,
}

export interface GemContextProxyOptions {
    secure?: boolean,
    followRedirects?: boolean,
}

export class GemContext {
    constructor(public request: GemRequest, public response: GemResponse) {

    }

    async send(opts: GemContextSendOptions) {
        const path = opts.path ?? this.request.url.pathname;
        await send(this, path, opts);
    }

    async proxy(urlStr: string, options: GemContextProxyOptions = {}) {
        const { secure = true, followRedirects = false } = options;
        const url = new URL(urlStr);
        const connection = secure
            ? await Deno.connectTls({ hostname: url.hostname, port: +url.port || 1965 })
            : await Deno.connect({ hostname: url.hostname, port: +url.port || 1965 });

        connection.write(new TextEncoder().encode(urlStr + '\r\n'));

        const response = await readAll(connection)
        const header = this.getHeader(response);
        const body = this.getBody(response);
        const [_, status, meta] = header.match(/^([0-9]{2}) ?(.*)/) ?? [];

        if (Math.floor(+status / 10) === 3 && followRedirects) {
            await this.proxy(meta, options);
        } else {
            this.response.status = +status || 43;
            this.response.meta = meta ?? 'Error proxying request'
            this.response.body = body;
        }
    }

    private getHeader(buf: Uint8Array) {
        let i = 0;
        for (i = 0; i < buf.length; i++) {
            if (buf[i] === NEW_LINE && buf[i - 1] === CARRAGE_RETURN) {
                i -= 1;
                break;
            }
        }
        return new TextDecoder().decode(buf.slice(0, i));
    }

    private getBody(buf: Uint8Array) {
        let i = 0;
        for (i = 0; i < buf.length; i++) {
            if (buf[i] === NEW_LINE && buf[i - 1] === CARRAGE_RETURN) {
                i += 1;
                break;
            }
        }
        return buf.slice(i);
    }

}