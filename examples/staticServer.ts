import { GemApplication } from '../mod.ts';

const app = new GemApplication();

app.use(async (ctx) => {
    await ctx.send({
        root: './resources/serveDir',
        index: 'index.gmi',
    })
});

app.listen({
    port: 1965,
    secure: true,
    certFile: './resources/localhost-cert.pem',
    keyFile: './resources/localhost-key.pem',
});
