export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function methodNotAllowed(methods: string[]) {
  return json({ error: `Method not allowed. Use ${methods.join(", ")}.` }, { status: 405 });
}
