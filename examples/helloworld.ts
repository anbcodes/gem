import { GemApplication } from '../mod.ts';

const app = new GemApplication();

app.use((ctx) => {
    ctx.response.body = 'Hello world!';
});

app.listen({
    port: 1965,
    // secure: true,
    // certFile: './resources/localhost-cert.pem',
    // keyFile: './resources/localhost-key.pem',
})

const connection = await Deno.connect({ port: 1965 });

connection.write(new TextEncoder().encode('gemini://localhost/\r\n'));

const buf = new Uint8Array(1000);

const amount = await connection.read(buf) ?? 0;

console.log(new TextDecoder().decode(buf.slice(0, amount)));
