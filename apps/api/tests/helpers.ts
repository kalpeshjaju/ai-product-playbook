/**
 * Shared test helpers for API route tests.
 *
 * WHY: createMockReq and createMockRes are used by multiple route test files.
 *      Centralizing them reduces duplication and keeps behavior consistent.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export function createMockReq(method: string, url = ''): IncomingMessage {
  return { method, url } as IncomingMessage;
}

export function createMockRes(): ServerResponse & { _body: string; _statusCode: number } {
  const res = {
    statusCode: 200,
    writableEnded: false,
    _body: '',
    _statusCode: 200,
    end(body?: string) {
      this._body = body ?? '';
      this._statusCode = this.statusCode;
      this.writableEnded = true;
    },
  } as unknown as ServerResponse & { _body: string; _statusCode: number };
  return res;
}
