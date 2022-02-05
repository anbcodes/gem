# Gem

Gem is an [gemini](https://gemini.circumlunar.space) server based on the idea of
middleware. Similar to [oak](https://github.com/oakserver/oak) or
[koa](https://github.com/koajs/koa/)

Example

```ts
import { GemApplication } from "https://deno.land/x/gem/mod.ts";

const app = new GemApplication();

app.use((ctx) => {
  ctx.response.body = "Hello world!";
});

app.listen({ port: 1965, secure: false });
```
