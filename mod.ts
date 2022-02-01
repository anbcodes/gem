import { extname, join, normalize } from 'https://deno.land/std/path/mod.ts'
import { contentType } from "https://deno.land/x/media_types/mod.ts";

interface GemRequest {
    url: URL,
    raw: string,
}

interface GemResponse {
    status: number,
    meta: string | null,
    body: string | Uint8Array | null,
}

interface GemContext {
    request: GemRequest,
    response: GemResponse,
    send: (opts: {
        root: string,
        index: string,
        path?: string,
        contentTypes?: Record<string, string>,
    }) => Promise<void>
}

const errorMessages: Record<number, string> = {
    10: 'Input: ',
    11: 'Sensitive Input: ',
    20: 'text/plain',
    30: 'Temporary redirection',
    31: 'Permanent redirection',
    40: 'Server Error',
    41: 'Server unavailable',
    42: 'CGI error',
    43: 'Proxy error',
    44: 'Slow down',
    50: 'Permanent Failure',
    51: 'Not found',
    52: 'Gone',
    53: 'Proxy request refused',
    59: 'Bad request',
    60: 'Certificate required',
    61: 'Certificate not authorized',
    62: 'Certificate not valid',
}

type GemMiddleware = (ctx: GemContext, next: () => Promise<void>) => void | Promise<void>;

export class GemError extends Error {
    constructor(public status: number, public message: string, public expose = true) {
        super();
    }
}

export class GemApplication {
    socket: Deno.Listener | undefined;
    middleware: GemMiddleware[] = [];

    use(func: GemMiddleware) {
        this.middleware.push(func);
    }

    listen(port?: number): Promise<void>;
    listen(options?: Deno.ListenOptions): Promise<void>;
    listen(portOrOptions?: number | Deno.ListenOptions): Promise<void> {
        let options: Deno.ListenOptions = {
            hostname: '127.0.0.1',
            port: 1965,
        }

        if (typeof portOrOptions === 'number') {
            options.port = portOrOptions;
        } else if (typeof portOrOptions === 'object') {
            options = portOrOptions;
        }

        this.socket = Deno.listen(options);
        return this.run(this.socket);
    }

    listenTls(options: Deno.ListenTlsOptions): Promise<void> {
        this.socket = Deno.listenTls(options);
        return this.run(this.socket);
    }

    private async run(socket: Deno.Listener) {
        while (true) {
            const conn = await socket.accept();
            this.handleConn(conn);
        }
    }

    private async handleConn(conn: Deno.Conn) {
        const raw = new Uint8Array(1026);
        const buf = new Uint8Array(1026);
        let off = 0;
        while (true) {
            const count = await conn.read(buf);
            if (count === null) {
                console.error("Error: Client closed the connection permaturely");
                conn.close();
                return;
            }
            if (off + count > 1026) {
                console.error("Error: Message to large");
                conn.write(new TextEncoder().encode('59 Message to large\r\n'))
                conn.close();
                return;
            }

            for (let i = 0; i < count; i++) {
                raw[i + off] = buf[i];
            }

            off = off + count;
            const str = new TextDecoder().decode(raw.slice(0, off));
            if (str.endsWith('\r\n')) {
                let url: URL;
                try {
                    url = new URL(str);
                } catch (_) {
                    console.error("Error: Invaild URL");
                    conn.write(new TextEncoder().encode('59 Invaild URL\r\n'))
                    conn.close();
                    return;
                }

                const request: GemRequest = {
                    url,
                    raw: str,
                }

                const response: GemResponse = {
                    status: 0,
                    body: null,
                    meta: null,
                }

                let ind = 0;

                const next = async () => {
                    if (!this.middleware[ind]) {
                        return;
                    }
                    const lastInd = ind;
                    await this.middleware[ind]({ request, response, send: (opts) => this.send({ request, response }, opts) }, async () => {
                        if (lastInd !== ind) return;
                        ind = ind + 1;
                        await next();
                    });
                    if (ind === lastInd) {
                        ind += 1;
                        await next();
                    }
                }

                try {
                    await next();
                    if (response.status === 0 && response.body !== null) {
                        response.status = 20;
                    }
                    if (Math.floor(response.status / 10) === 2 && response.meta === null) {
                        response.meta = 'text/plain'
                    }
                    if (Math.floor(response.status / 10) !== 2) {
                        throw new GemError(response.status, response.meta ?? '', true);
                    }
                } catch (e) {
                    console.error("Error: ", e);
                    let error = e;
                    if (!(e instanceof Error)) {
                        error = new Error(`Non-error value: ${JSON.stringify(e)}`);
                    }

                    response.status = error instanceof Deno.errors.NotFound
                        ? 51
                        : (error.status && typeof error.status === 'number' && error.status >= 10 && error.status <= 69
                            ? error.status
                            : 40);
                    response.meta = e.expose ? e.message : this.errorMessageForStatus(e.status);
                    response.body = 'Error';
                }

                const responseHeader = new TextEncoder().encode(`${response.status} ${response.meta || ''}\r\n`);
                let responseRaw = responseHeader;
                if (response.body !== null && Math.floor(response.status / 10) === 2) {
                    const body = response.body instanceof Uint8Array ? response.body : new TextEncoder().encode(response.body);
                    responseRaw = this.concatUintArrays(responseHeader, body);
                }

                conn.write(responseRaw);
                conn.close();
                return;
            }
        }
    }

    private errorMessageForStatus(status: number) {
        return errorMessages[status] ?? errorMessages[Math.floor(status / 10)]
    }

    private concatUintArrays(...arrays: Uint8Array[]) {
        const totalLength = arrays.reduce((acc, value) => acc + value.length, 0);

        if (!arrays.length) return new Uint8Array();

        const result = new Uint8Array(totalLength);

        let length = 0;
        for (const array of arrays) {
            result.set(array, length);
            length += array.length;
        }

        return result;
    }

    private async send(ctx: { request: GemRequest, response: GemResponse }, opts: { path?: string, root: string, index: string, contentTypes?: Record<string, string> }) {
        const path = opts.path ?? ctx.request.url.pathname;
        const normalPath = normalize(path);
        if (normalPath.startsWith('..')) {
            throw new GemError(59, 'Path must not travel up from the root directory');
        }

        let pathToRequest = join(opts.root, normalPath);

        const stat = await Deno.stat(pathToRequest);

        if (stat.isDirectory) {
            pathToRequest = join(pathToRequest, opts.index);
        }

        const additionalContentTypes: Record<string, string | undefined> = {
            '.gmi': 'text/gemini',
            '.gemini': 'text/gemini',
        }

        const meta = opts.contentTypes?.[extname(pathToRequest)] ?? additionalContentTypes?.[extname(pathToRequest)] ?? contentType(pathToRequest) ?? 'text/plain';

        const contents = await Deno.readFile(pathToRequest);

        ctx.response.status = 20;
        ctx.response.meta = meta;
        ctx.response.body = contents;
    }
}