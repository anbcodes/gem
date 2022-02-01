/*!
 * Adapted from oak's send.ts at https://github.com/oakserver/oak/blob/main/send.ts and which is licensed
 * with the MIT license.
 */

import { GemError } from './error.ts';
import { GemContext } from './context.ts';

import { join, extname, contentType, normalize } from './deps.ts';

export interface SendOptions {
    root: string,
    index?: string,
    contentTypes?: Record<string, string>,
    hidden?: boolean,
}

function isHidden(path: string) {
    const pathArr = path.split("/");
    for (const segment of pathArr) {
        if (segment[0] === "." && segment !== "." && segment !== "..") {
            return true;
        }
        return false;
    }
}

export async function send(
    { response }: GemContext,
    path: string,
    opts: SendOptions = { root: "" }
) {
    const { root, hidden = false, index } = opts;
    const normalPath = normalize(path);
    if (normalPath.startsWith('..')) {
        throw new GemError(59, 'Path must not travel up from the root directory');
    }

    let pathToRequest = join(root, normalPath);

    if (isHidden(pathToRequest) && !hidden) {
        return;
    }

    try {
        const stat = await Deno.stat(pathToRequest);

        if (stat.isDirectory && index) {
            pathToRequest = join(pathToRequest, index);
            if (!(await Deno.stat(pathToRequest)).isFile) {
                throw new Error();
            }
        }
    } catch (_) {
        throw new GemError(51);
    }

    const additionalContentTypes: Record<string, string | undefined> = {
        '.gmi': 'text/gemini; lang=en',
        '.gemini': 'text/gemini; lang=en',
    }

    const meta = opts.contentTypes?.[extname(pathToRequest)]
        ?? additionalContentTypes?.[extname(pathToRequest)]
        ?? contentType(pathToRequest)
        ?? 'text/plain';

    let contents;
    try {
        contents = await Deno.readFile(pathToRequest);
    } catch (e) {
        if (e instanceof Deno.errors.NotFound || (e instanceof Error && e.message.includes('os error 21'))) {
            throw new GemError(51);
        } else {
            throw e;
        }
    }

    response.status = 20;
    response.meta = meta;
    response.body = contents;
}