export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const workerUrl = 'https://auth-worker.mybackpacc.workers.dev' + url.pathname + url.search;

  const newRequest = new Request(workerUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null
  });

  return fetch(newRequest);
}
