import { createServer } from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

// ---------------------------------------------------------------------------
// Passcode gate
//   PASSCODE (required)  the code visitors must enter
//   SECRET   (recommended) long random string used to sign login cookies
//   TITLE    (optional)  name shown on the lock screen
// ---------------------------------------------------------------------------
const PASSCODE = process.env.PASSCODE;
const SECRET = process.env.SECRET || crypto.randomBytes(32).toString("hex");
const TITLE = process.env.TITLE || "Private Access";
const SESSION_HOURS = 12;

if (!PASSCODE) {
	console.error("Missing PASSCODE environment variable. Refusing to start unlocked.");
	process.exit(1);
}

const sha = (s) => crypto.createHash("sha256").update(s).digest();
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("hex");

function makeSession() {
	const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
	return `${exp}.${sign(String(exp))}`;
}

// works with a raw Node request (needed for the websocket upgrade too)
function validSession(rawReq) {
	const m = /(?:^|;\s*)s=([^;]+)/.exec(rawReq.headers.cookie || "");
	if (!m) return false;
	const [exp, sig] = m[1].split(".");
	if (!exp || !sig || Number(exp) < Date.now()) return false;
	const good = sign(exp);
	return (
		sig.length === good.length &&
		crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))
	);
}

const passcodeOk = (input) =>
	crypto.timingSafeEqual(sha(String(input)), sha(PASSCODE));

// 8 wrong tries per 10 minutes per IP
const attempts = new Map();
const clientIp = (req) =>
	(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
	req.socket.remoteAddress;
function tooMany(ip) {
	const now = Date.now();
	const list = (attempts.get(ip) || []).filter((t) => now - t < 600000);
	attempts.set(ip, list);
	return list.length >= 8;
}

const esc = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const loginPage = (err) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(TITLE)}</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#07110b;color:#e2e8f0}
.card{background:#1e293b;padding:2rem;border-radius:14px;width:min(92vw,380px);box-shadow:0 10px 30px #0006}
h1{font-size:1.3rem;margin:0 0 1rem}input,button{width:100%;padding:.8rem;border-radius:8px;border:1px solid #475569;font-size:1rem;margin-top:.6rem}
input{background:#0f172a;color:#e2e8f0}button{background:#22c55e;border:0;color:#04120a;cursor:pointer;font-weight:700}
.err{color:#f87171;margin:.5rem 0 0;font-size:.9rem}
</style></head><body><div class="card"><h1>${esc(TITLE)}</h1>
<form method="POST" action="/login"><input type="password" name="code" placeholder="Passcode" autofocus required>
<button>Enter</button>${err ? `<p class="err">${esc(err)}</p>` : ""}</form></div></body></html>`;

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
	allow_udp_streams: false,
	hostname_blacklist: [/example\.com/],
	dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
				res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
				handler(req, res);
			})
			.on("upgrade", (req, socket, head) => {
				// the proxy tunnel is locked too, not just the pages
				if (!validSession(req)) {
					socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
					return;
				}
				if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
				else socket.end();
			});
	},
});

fastify.addContentTypeParser(
	"application/x-www-form-urlencoded",
	{ parseAs: "string", bodyLimit: 10000 },
	(req, body, done) => {
		try {
			done(null, Object.fromEntries(new URLSearchParams(body)));
		} catch (e) {
			done(e);
		}
	}
);

// Everything except /login requires a valid session cookie.
fastify.addHook("onRequest", async (req, reply) => {
	const path = req.url.split("?")[0];
	if (path === "/login") return;
	if (validSession(req.raw)) return;
	return reply.redirect("/login");
});

fastify.get("/login", async (req, reply) => {
	if (validSession(req.raw)) return reply.redirect("/");
	return reply.type("text/html").send(loginPage());
});

fastify.post("/login", async (req, reply) => {
	const ip = clientIp(req.raw);
	if (tooMany(ip)) {
		return reply
			.code(429)
			.type("text/html")
			.send(loginPage("Too many attempts. Try again later."));
	}
	const code = (req.body && req.body.code) || "";
	if (!passcodeOk(code)) {
		attempts.get(ip).push(Date.now());
		return reply
			.code(401)
			.type("text/html")
			.send(loginPage("Incorrect passcode."));
	}
	const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
	reply.header(
		"Set-Cookie",
		`s=${makeSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}`
	);
	return reply.redirect("/");
});

fastify.post("/logout", async (req, reply) => {
	reply.header("Set-Cookie", "s=; Max-Age=0; Path=/");
	return reply.redirect("/login");
});

fastify.register(fastifyStatic, {
	root: publicPath,
	decorateReply: true,
});

fastify.register(fastifyStatic, {
	root: scramjetPath,
	prefix: "/scram/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: libcurlPath,
	prefix: "/libcurl/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

fastify.setNotFoundHandler((res, reply) => {
	return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});
