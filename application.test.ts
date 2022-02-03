import { GemApplication } from './application.ts';

import { GemContext } from './context.ts';

import { GemError } from './error.ts';

import { assert, assertEquals, readAll } from './test_deps.ts';

const TEST_PORT = 8001;

async function request(url: string, port = TEST_PORT, hostname = '127.0.0.1'): Promise<string> {
    const conn = await Deno.connect({ port, hostname });
    conn.write(new TextEncoder().encode(url + '\r\n'));
    const data = new TextDecoder().decode(await readAll(conn));
    conn.close();
    return data;
}

const { test } = Deno;

test('construct GemApplication()', () => {
    const app = new GemApplication();
    assert(app instanceof GemApplication);
})

test('register middleware', async () => {
    const app = new GemApplication();
    let called = 0;
    app.use((context, next) => {
        assert(context instanceof GemContext);
        assertEquals(typeof next, "function");
        called++;
    });

    const listen = app.listen(`:${TEST_PORT}`);

    await request("gemini://localhost");

    assertEquals(called, 1);

    app.close();
    await listen;
});

test('register middleware - accepts non void', async () => {
    const app = new GemApplication();
    app.use((context) => 1);
});

test('middleware execution order 1', async () => {
    const app = new GemApplication();
    const callStack: number[] = [];
    app.use(() => {
        callStack.push(1);
    });

    app.use(() => {
        callStack.push(2);
    });

    const listen = app.listen(`:${TEST_PORT}`);

    await request("gemini://localhost");

    assertEquals(callStack, [1]);

    app.close();

    await listen;
});

test('middleware execution order 2', async () => {
    const app = new GemApplication();
    const callStack: number[] = [];
    app.use((_context, next) => {
        callStack.push(1);
        next();
    });

    app.use(() => {
        callStack.push(2);
    });

    const listen = app.listen(`:${TEST_PORT}`);

    await request("gemini://localhost");

    assertEquals(callStack, [1, 2]);

    app.close();

    await listen;
});

test('middleware execution order 3', async () => {
    const app = new GemApplication();
    const callStack: number[] = [];

    app.use((_context, next) => {
        callStack.push(1);
        next();
        callStack.push(2);
    });

    app.use(async () => {
        callStack.push(3);
        await Promise.resolve();
        callStack.push(4);
    });

    const listen = app.listen(`:${TEST_PORT}`);

    await request("gemini://localhost");

    assertEquals(callStack, [1, 3, 2, 4]);

    app.close();

    await listen;
});

test('middleware execution order 4', async () => {
    const app = new GemApplication();
    const callStack: number[] = [];

    app.use(async (_context, next) => {
        callStack.push(1);
        await next();
        callStack.push(2);
    });

    app.use(async () => {
        callStack.push(3);
        await Promise.resolve();
        callStack.push(4);
    });

    const listen = app.listen(`:${TEST_PORT}`);

    await request("gemini://localhost");

    assertEquals(callStack, [1, 3, 4, 2]);

    app.close();

    await listen;
});

test('app.listen', async () => {
    const app = new GemApplication();

    app.use(() => { });

    const listen = app.listen(`127.0.0.1:${TEST_PORT}`);

    app.close();

    await listen;
});

// TODO: Figure out why this hangs
// test('app.listen IPv6 Loopback', async () => {
//     const app = new GemApplication();

//     app.use(() => { console.log('test') });

//     const listen = await app.listen(`[::1]:${TEST_PORT}`);

//     await request('gemini://localhost', TEST_PORT, '::1');

//     app.close();

//     await listen;
// });

test('app.listen(options)', async () => {
    const app = new GemApplication();

    app.use(() => { });

    const listen = app.listen({ port: TEST_PORT });

    app.close();

    await listen;
});

// test('app.listen({secure: true})', async () => {
//     const app = new GemApplication();

//     app.use(() => { });

//     const listen = app.listen({ port: TEST_PORT, secure: true, keyFile: '', certFile: '' });

//     app.close();

//     await listen;
// });

test('uncaught errors impact response', async () => {
    const app = new GemApplication();

    app.use(() => {
        throw new GemError(41, "An Error!")
    });

    const listen = app.listen({ port: TEST_PORT });

    assertEquals(await request('gemini://localhost'), '41 An Error!\r\n');

    app.close();

    await listen;
});

test('uncaught generic errors provide a 40 response', async () => {
    const app = new GemApplication();

    app.use(() => {
        throw new Error();
    });

    const listen = app.listen({ port: TEST_PORT });

    assert((await request('gemini://localhost')).startsWith('40'));

    app.close();

    await listen;
});
