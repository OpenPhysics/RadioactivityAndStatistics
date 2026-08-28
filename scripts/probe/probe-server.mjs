/**
 * probe-server.mjs
 *
 * Serves the USB probe page and collects its log, so bring-up findings land in
 * a file on the dev machine instead of being read off a browser console.
 *
 * Same-origin on purpose: the page POSTs its log lines back to the server that
 * served it, which is the only thing a page's own CSP will allow without
 * loosening `connect-src`.
 *
 *   node scripts/probe/probe-server.mjs [port]
 *
 * Not part of the sim. Delete along with the probe once the USB transport is
 * confirmed against hardware.
 */

import { createServer } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 5199);
const logPath = join(here, "probe.log");

const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);

  if (request.method === "POST" && url.pathname === "/log") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      appendFileSync(logPath, `${body}\n`);
      process.stdout.write(`${body}\n`);
      response.writeHead(204).end();
    });
    return;
  }

  const name = url.pathname === "/" ? "/usb-probe.html" : url.pathname;
  const extension = name.slice(name.lastIndexOf("."));
  try {
    const file = readFileSync(join(here, name.replace(/^\//, "")));
    response.writeHead(200, { "Content-Type": contentTypes[extension] ?? "application/octet-stream" }).end(file);
  } catch {
    response.writeHead(404).end("not found");
  }
});

server.listen(port, () => {
  process.stdout.write(`probe server on http://localhost:${port}/  →  ${logPath}\n`);
});
