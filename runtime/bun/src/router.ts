export type RouteHandler = (req: Request, params: Record<string, string>) => Response | Promise<Response>;

export class RadiantRouter {
  private prefix: string;
  private routes: {
    method: string;
    pattern: URLPattern;
    handler: RouteHandler;
  }[] = [];

  constructor(prefix: string = "") {
    // Ensure prefix doesn't have a trailing slash unless it's just '/'
    this.prefix = prefix.endsWith("/") && prefix.length > 1 ? prefix.slice(0, -1) : prefix;
  }

  add(method: string, path: string, handler: RouteHandler) {
    // Clean path and ensure it starts with /
    let cleanPath = path.startsWith("/") ? path : `/${path}`;
    
    // Combine prefix and path
    let fullPath = `${this.prefix}${cleanPath}`;
    
    // Fix double slashes if prefix was '/'
    fullPath = fullPath.replace(/\/\//g, "/");

    // URLPattern handles paths like /api/users/:id natively
    this.routes.push({
      method,
      pattern: new URLPattern({ pathname: fullPath }),
      handler,
    });
  }

  get(path: string, handler: RouteHandler) { this.add('GET', path, handler); }
  post(path: string, handler: RouteHandler) { this.add('POST', path, handler); }
  patch(path: string, handler: RouteHandler) { this.add('PATCH', path, handler); }
  delete(path: string, handler: RouteHandler) { this.add('DELETE', path, handler); }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Preflight CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    for (const route of this.routes) {
      if (route.method === req.method || route.method === 'ALL') {
        const match = route.pattern.exec(url);
        if (match) {
          try {
            // Add CORS headers to all responses
            const res = await route.handler(req, match.pathname.groups);
            res.headers.set('Access-Control-Allow-Origin', '*');
            return res;
          } catch (e: any) {
            console.error(e);
            return new Response(JSON.stringify({ error: e.message }), { 
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              }
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), { 
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
