import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve } from "node:path";

const root = resolve("site");
const port = Number(process.env.SITE_PORT ?? 4173);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png"
};

createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const requested = path === "/" ? "/index.html" : path;
  const file = resolve(root, "." + normalize(requested));
  if (!file.startsWith(root + "\\") || !existsSync(file)) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log("Preview: http://localhost:" + port));
