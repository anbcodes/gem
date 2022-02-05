import { GemContext } from './context.ts';
import { GemRequest } from './request.ts';
import { GemError } from './error.ts';
import { GemResponse } from './response.ts';
import { GemMiddleware } from './middleware.ts';

import { compose } from './middleware.ts';

const ADDR_REGEXP = /^\[?([^\]]*)\]?:([0-9]{1,5})$/;

export interface ListenOptionsBase extends Deno.ListenOptions {
    /**
     * Determins whether the application listens on SSL or TCP
     * @default true
     */
    secure: false;
    signal?: AbortSignal;
}

export interface ListenOptionsTls extends Deno.ListenTlsOptions {
    alpnProtocols?: string[];
    /**
     * Determins whether the application listens on SSL or TCP
     * @default true
     */
    secure: true | undefined;
    signal?: AbortSignal;
}

export type ListenOptions = ListenOptionsTls | ListenOptionsBase;

function defaultGetSocket(opts: ListenOptions) {
    let socket: Deno.Listener;
    if (opts.secure === false) {
        socket = Deno.listen(opts);
    } else {
        socket = Deno.listenTls(opts);
    }

    return socket;
}

export class GemApplication {
    private socket: Deno.Listener | undefined;
    private middleware: GemMiddleware[] = [];
    private closed = false;

    constructor() {

    }

    use(func: GemMiddleware) {
        this.middleware.push(func);
    }

    /** Start listening for requests, processing registered middleware on each
   * request.  If the options `.secure` is undefined or `false`, the listening
   * will be over raw TCP.  If the options `.secure` property is `true`, a
   * `.certFile` and a `.keyFile` property need to be supplied and requests
   * will be processed over TLS.
   * 
   * @param addr the address of the server
   * 
   * @example
   * ```ts
   * import { GemApplication } from 'https://deno.land/x/gem/mod.ts';
   * 
   * const app = new GemApplication();
   * 
   * app.listen(':1965')
   * ```
   * */
    async listen(addr: string): Promise<void>;
    /** Start listening for requests, processing registered middleware on each
   * request.  If the options `.secure` is undefined or `false`, the listening
   * will be over raw TCP.  If the options `.secure` property is `true`, a
   * `.certFile` and a `.keyFile` property need to be supplied and requests
   * will be processed over TLS.
   * 
   * @param options the options to use to listen
   * 
   * @example
   * ```ts
   * import { GemApplication } from 'https://deno.land/x/gem/mod.ts';
   * 
   * const app = new GemApplication();
   * 
   * app.listen({
   *    port: 1965,
   *    secure: false,
   * })
   * ```
   * */
    async listen(options: ListenOptions): Promise<void>;
    async listen(options: string | ListenOptions): Promise<void> {
        if (!this.middleware.length) {
            throw new TypeError("There is no middleware to process requests.");
        }

        if (typeof options === "string") {
            const match = ADDR_REGEXP.exec(options);
            if (!match) {
                throw TypeError(`Invalid address passed: "${options}"`);
            }
            const [, hostname, portStr] = match;
            options = { hostname, port: parseInt(portStr, 10), secure: false };
        }

        this.socket = defaultGetSocket(options);

        try {
            while (true) {
                const conn = await this.socket.accept();
                this.handleRequest(conn).catch(e => {
                    if (e instanceof GemError) {
                        conn.write(GemResponse.fromError(e).toUint8Array());
                        conn.close();
                    } else {
                        const message = e instanceof Error
                            ? e.message
                            : "Application Error";
                        console.error('Error: ', message);
                        conn.write(GemResponse.fromError(new GemError(40)).toUint8Array());
                        conn.close();
                    }
                }).catch(e => {
                    const message = e instanceof Error
                        ? e.message
                        : "Application Error";
                    console.error('Error: ', message);
                });
            }
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Application Error";
            if (!(message === 'Listener has been closed' && this.closed)) {
                console.error('Error: ', message);
            }
        }
    }

    /**
     * Handles a request/URL by running the middleware. It returns the response
     * @param url The URL (as a string) to proccess
     * @returns A promise for a GemResponse
     * 
     * @example
     * // TODO
     */
    public async handle(url: string): Promise<GemResponse> {
        const request = new GemRequest(url);
        return await this.executeRequest(request);
    }

    public close() {
        this.closed = true;
        this.socket?.close();
    }

    async executeRequest(request: GemRequest): Promise<GemResponse> {
        const response = new GemResponse();
        const context = new GemContext(request, response);

        await compose(this.middleware)(context);

        return context.response;
    }

    async handleRequest(conn: Deno.Conn) {
        const request = await GemRequest.fromReader(conn);
        const response = await this.executeRequest(request);
        conn.write(response.toUint8Array());
        conn.close();
    }
}
