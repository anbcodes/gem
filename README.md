# Gem

Gem is an [gemini](https://gemini.circumlunar.space) server based on the idea of
middleware. Similar to [oak](https://github.com/oakserver/oak) or
[koa](https://github.com/koajs/koa/)

Example

```ts
import { GemApplication } from "deno.land/x/gem/mod.ts";

const app = new GemApplication();

app.use((ctx) => {
  ctx.response = "Hello world!";
});

app.listen(1965);
```