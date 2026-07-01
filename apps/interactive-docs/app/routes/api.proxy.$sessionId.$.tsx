import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { getSession } from "~/utils/playground.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return proxyRequest(request, params);
}

export async function action({ request, params }: ActionFunctionArgs) {
  return proxyRequest(request, params);
}

async function proxyRequest(request: Request, params: Record<string, string | undefined>) {
  const sessionId = params.sessionId;
  const path = params["*"] || "";

  if (!sessionId) {
    return new Response("Missing Session ID", { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return new Response("Session expired or not found", { status: 404 });
  }

  const targetUrl = new URL(request.url);
  targetUrl.protocol = "http:";
  targetUrl.hostname = "127.0.0.1";
  targetUrl.port = session.port.toString();
  targetUrl.pathname = "/" + path;

  const headers = new Headers(request.headers);
  headers.set("Host", `127.0.0.1:${session.port}`);

  try {
    const proxyRes = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });

    const responseHeaders = new Headers(proxyRes.headers);
    
    return new Response(proxyRes.body, {
      status: proxyRes.status,
      statusText: proxyRes.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response("Proxy Error", { status: 502 });
  }
}
