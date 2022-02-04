import { GemApplication } from '../mod.ts';

const app = new GemApplication();

app.use((ctx) => {
    ctx.response.body = 'Hello world!';
});

app.listen({
    port: 1965,
    secure: true,
    certFile: './resources/localhost-cert.pem',
    keyFile: './resources/localhost-key.pem',
})
