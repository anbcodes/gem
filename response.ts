import { GemError } from './error.ts';

export class GemResponse {
    constructor(public status = 20, public meta: string = 'text/plain', public body: string | Uint8Array | null = null) {

    }

    public static fromError(err: GemError) {
        return new GemResponse(err.status, err.expose ? err.message : undefined);
    }

    public sendTo(conn: Deno.Conn) {
        this.validate();
        const header = new TextEncoder().encode(`${this.status} ${this.meta}\r\n`);
        let response = header;
        if (this.body !== null && Math.floor(this.status / 10) === 2) {
            const body = typeof this.body === 'string' ? new TextEncoder().encode(this.body) : this.body;
            response = new Uint8Array(header.byteLength + body.byteLength);
            response.set(header, 0);
            response.set(body, header.byteLength);
        }

        conn.write(response);
        conn.close();
    }

    public validate() {
        if (this.status < 10 || this.status > 69) {
            throw new Error('Invaild response status: ' + this.status);
        }
    }
}
