import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import { renderToPipeableStream } from 'react-dom/server';
import {
  ServerRouter,
  type EntryContext,
  type HandleErrorFunction,
  type RouterContextProvider,
} from 'react-router';
import { hubContext, NonceContext } from './context';

export { hubContext };

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }
  const hub = loadContext.get(hubContext);
  let status = responseStatusCode;
  return new Promise<Response>((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <NonceContext value={hub.nonce}>
        <ServerRouter context={routerContext} url={request.url} nonce={hub.nonce} />
      </NonceContext>,
      {
        nonce: hub.nonce,
        onAllReady() {
          const body = new PassThrough();
          responseHeaders.set('Content-Type', 'text/html');
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status,
            }),
          );
          pipe(body);
        },
        onShellError: reject,
        onError(error) {
          status = 500;
          hub.capture(error, { route: new URL(request.url).pathname, requestId: hub.requestId });
        },
      },
    );
    setTimeout(abort, streamTimeout + 1_000);
  });
}

export const handleError: HandleErrorFunction = (error, { request, context }) => {
  if (!request.signal.aborted) {
    const hub = context.get(hubContext);
    hub.capture(error, { route: new URL(request.url).pathname, requestId: hub.requestId });
  }
};
