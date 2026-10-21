import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8080);

createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ ok: true, path: request.url }));
}).listen(port, () => {
  console.log(`microvm listening on ${port}`);
});
