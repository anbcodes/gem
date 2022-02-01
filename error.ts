export class GemError extends Error {
    constructor(public status: number, message?: string, public expose = true) {
        super();

        this.name = 'GemError';

        this.message = message ?? getMessageForStatus(status);
    }
}

export const getMessageForStatus = (status: number) => {
    return errorMessages[status] ?? errorMessages[Math.floor(status / 10)] ?? '';
}

const errorMessages: Record<number, string> = {
    10: 'Input: ',
    11: 'Sensitive Input: ',
    20: 'text/plain; lang=en',
    30: 'Temporary redirection',
    31: 'Permanent redirection',
    40: 'Server Error',
    41: 'Server unavailable',
    42: 'CGI error',
    43: 'Proxy error',
    44: 'Slow down',
    50: 'Permanent Failure',
    51: 'Not found',
    52: 'Gone',
    53: 'Proxy request refused',
    59: 'Bad request',
    60: 'Certificate required',
    61: 'Certificate not authorized',
    62: 'Certificate not valid',
}