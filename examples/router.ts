import { GemApplication, GemRouter } from '../mod.ts';

const app = new GemApplication();

const router = new GemRouter({
    urlPrefix: 'gemini://localhost',
})

router.on('/', (ctx) => {
    ctx.response.body = 'Hello World!';
});

router.on('/hello', (ctx) => {
    ctx.response.body = 'Hello route';
});

router.on('/api/:name', (ctx) => {
    ctx.response.body = `Hello ${ctx.params.name}!`;
});

app.use(router.routes());

app.listen({
    port: 1965,
    secure: true,
    certFile: './resources/localhost-cert.pem',
    keyFile: './resources/localhost-key.pem',
});

