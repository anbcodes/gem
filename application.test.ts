import { GemApplication } from './application.ts';

import { GemContext } from './context.ts';

import { GemError } from './error.ts';

import { assert, assertEquals, readAll, assertRejects } from './test_deps.ts';

const TEST_PORT = 8001;

async function request(url: string, port = TEST_PORT, hostname = '127.0.0.1'): Promise<string> {
    const conn = await Deno.connect({ port, hostname });
    conn.write(new TextEncoder().encode(url + '\r\n'));
    const data = new TextDecoder().decode(await readAll(conn));
    conn.close();
    return data;
}

const captured: {
    obj: any,
    name: string,
    org: any,
}[] = [];

const capture = (obj: any, name: string, callOriginal = false): { params: any[], ret: any }[] => {
    const arr: { params: any[], ret: any }[] = [];

    const org = obj[name];

    obj[name] = (...args: any[]) => {
        const obj = {
            params: args,
            ret: null,
        };
        if (callOriginal) {
            obj.ret = org(...args);
        }
        arr.push(obj);
    }

    captured.push({ obj, name, org })

    return arr;
}

const release = () => {
    captured.forEach(({ obj, name, org }) => {
        obj[name] = org;
    })
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

test('register middleware - accepts non void', () => {
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

    const listen = app.listen({ port: TEST_PORT, secure: false });

    app.close();

    await listen;
});

test('app.listen({secure: true})', async () => {
    const app = new GemApplication();

    app.use(() => { });

    const listen = app.listen({ port: TEST_PORT, secure: true, keyFile: './test_resources/localhost-key.pem', certFile: './test_resources/localhost-cert.pem' });

    app.close();

    await listen;
});

test('uncaught errors impact response', async () => {
    const app = new GemApplication();

    app.use(() => {
        throw new GemError(41, "An Error!")
    });

    const listen = app.listen({ port: TEST_PORT, secure: false });

    assertEquals(await request('gemini://localhost'), '41 An Error!\r\n');

    app.close();

    await listen;
});

test('uncaught generic errors provide a 40 response', async () => {
    const errors = capture(console, 'error');

    const app = new GemApplication();

    app.use(() => {
        throw new Error();
    });

    const listen = app.listen({ port: TEST_PORT, secure: false });

    assert((await request('gemini://localhost')).startsWith('40'));

    app.close();

    await listen;

    assertEquals(errors[0].params.join(' '), 'Error:  ');
    release();
});

test('throws on no middleware', async () => {
    const app = new GemApplication();

    await assertRejects(() => app.listen(`:${TEST_PORT}`), TypeError);
})

test('app.handle calls the context', async () => {
    const app = new GemApplication();
    let called = 0;
    app.use((_) => {
        called += 1;
    })

    await app.handle('gemini://example.com/test');

    assertEquals(called, 1);
})

test('app.handle calls the context with the correct url', async () => {
    const app = new GemApplication();
    let called = 0;
    app.use((ctx) => {
        if (ctx.request.raw === 'gemini://example.com/test') {
            called += 1;
        }
    })

    await app.handle('gemini://example.com/test');

    assertEquals(called, 1);
})

test('app.handle returns the response', async () => {
    const app = new GemApplication();
    app.use((ctx) => {
        ctx.response.body = 'Hello world';
        ctx.response.meta = 'text/gemini; lang=en';
        ctx.response.status = 20;
    })

    const response = await app.handle('gemini://example.com/test');

    assertEquals(response.body, 'Hello world');
    assertEquals(response.meta, 'text/gemini; lang=en');
    assertEquals(response.status, 20);
})

test('app.listen errors on invalid address', async () => {
    const app = new GemApplication();
    app.use(() => {
    })

    await assertRejects(() => app.listen(''), TypeError, 'Invalid address passed');
    await assertRejects(() => app.listen('bad'), TypeError, 'Invalid address passed');
    await assertRejects(() => app.listen('293'), TypeError, 'Invalid address passed');
})

test('next can only be called once', async () => {
    const app = new GemApplication();
    let errored = false;

    app.use(async (_, next) => {
        await next();
        try {
            await next()
        } catch (e) {
            if (e instanceof Error && e.message.includes('next() called multiple times')) {
                errored = true;
            } else {
                throw e;
            }
        }
    })

    await app.handle('gemini://test');

    assert(errored);
})

test('correctly handles non-error throws', async () => {
    const errors = capture(console, 'error');

    const app = new GemApplication();
    app.use(() => {
        throw 'Hi';
    })

    const listen = app.listen(`:${TEST_PORT}`);

    await request('gemini://test.com');

    app.close();
    await listen;

    assertEquals(errors[0].params.join(' '), 'Error:  Application Error');
    release();
})
