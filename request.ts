import { GemError } from './error.ts';

const CARRAGE_RETURN = '\r'.charCodeAt(0);
const NEW_LINE = '\n'.charCodeAt(0);

export class GemRequest {
    public url: URL;

    constructor(public raw: string) {
        try {
            this.url = new URL(raw);
        } catch (_) {
            throw new GemError(59, 'Invalid URL');
        }
    }

    public static async fromConnection(conn: Deno.Conn) {
        const buf = new Uint8Array(1026);
        const req = new Uint8Array(1026);

        let off = 0;
        while (true) {
            const readLen = await conn.read(buf);
            if (readLen === null) {
                throw new Error('Client prematurely closed the connection');
            }

            if (off + readLen > 1026) {
                throw new GemError(59, 'URL Too Long');
            }

            req.set(buf.slice(0, readLen), off);
            off += readLen;

            if (req[off - 1] === NEW_LINE && req[off - 2] === CARRAGE_RETURN) {
                const raw = new TextDecoder().decode(req.slice(0, off));
                return new GemRequest(raw);
            }
        }
    }
}
