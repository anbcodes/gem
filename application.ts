import { GemContext } from './context.ts';
import { GemRequest } from './request.ts';
import { GemError } from './error.ts';
import { GemResponse } from './response.ts';
import { GemMiddleware } from './middleware.ts';

import { compose } from './middleware.ts';

const ADDR_REGEXP = /^\[?([^\]]*)\]?:([0-9]{1,5})$/;

export interface ListenOptionsBase extends Deno.ListenOptions {
    secure?: false;
    signal?: AbortSignal;
}

export interface ListenOptionsTls extends Deno.ListenTlsOptions {
    alpnProtocols?: string[];
    secure: true;
    signal?: AbortSignal;
}

export type ListenOptions = ListenOptionsTls | ListenOptionsBase;

export class GemApplication {
    private socket: Deno.Listener | undefined;
    private middleware: GemMiddleware[] = [];
    private handling: Promise<void>[] = [];

    use(func: GemMiddleware) {
        this.middleware.push(func);
    }

    /** Start listening for requests, processing registered middleware on each
   * request.  If the options `.secure` is undefined or `false`, the listening
   * will be over raw TCP.  If the options `.secure` property is `true`, a
   * `.certFile` and a `.keyFile` property need to be supplied and requests
   * will be processed over TLS. */
    async listen(addr: string): Promise<void>;
    /** Start listening for requests, processing registered middleware on each
   * request.  If the options `.secure` is undefined or `false`, the listening
   * will be over raw TCP.  If the options `.secure` property is `true`, a
   * `.certFile` and a `.keyFile` property need to be supplied and requests
   * will be processed over TLS. */
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
            options = { hostname, port: parseInt(portStr, 10) };
        }

        if (options.secure) {
            this.socket = Deno.listenTls(options);
        } else {
            this.socket = Deno.listen(options);
        }

        try {
            while (true) {
                const conn = await this.socket.accept();
                this.handleRequest(conn).catch(e => {
                    if (e instanceof GemError) {
                        GemResponse.fromError(e).sendTo(conn);
                    } else {
                        const message = e instanceof Error
                            ? e.message
                            : "Application Error";
                        console.error('Error: ', message);
                        GemResponse.fromError(new GemError(40)).sendTo(conn);
                    }
                });
            }
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Application Error";
            console.error('Error: ', message);
        }
    }

    async handleRequest(conn: Deno.Conn) {
        const request = await GemRequest.fromConnection(conn);
        const response = new GemResponse();
        const context = new GemContext(request, response);

        await compose(this.middleware)(context);

        context.response.sendTo(conn);
    }
}
