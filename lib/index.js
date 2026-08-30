import { execFile, spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
//#region ../test-lhh010/packages/util/home-paths/lib/index.js
/**
* Shared filesystem path helpers for DeepSeek Harness user data.
*
* @module @deepseek-ai/dsh-home-paths
*/
/** Directory name for the default DeepSeek Harness home under the OS home. */
const DSH_HOME_DIR_NAME = ".dsh";
/** Environment variable that overrides the default DeepSeek Harness home. */
const DSH_HOME_ENV = "DSH_HOME";
/**
* Resolve the default DeepSeek Harness home using Node's platform path rules.
* @returns the absolute default harness home path.
*/
function defaultDshHome() {
	return join(homedir(), DSH_HOME_DIR_NAME);
}
/**
* Expand supported tilde prefixes against the operating-system home.
* @param path - configured path that may begin with `~`, `~/`, or `~\`.
* @returns the expanded path, or the original value when no supported prefix is present.
*/
function expandHomePath(path) {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
	return path;
}
/**
* Resolve the single-root DeepSeek Harness home.
*
* Precedence, highest first: an explicit configured path, `$DSH_HOME`, then
* `~/.dsh`. The harness keeps all user data under one root. An empty or
* whitespace-only `$DSH_HOME` is treated as unset, so a blank override never
* resolves the home to the current working directory.
* @param configured - explicit harness-home override, which has highest precedence.
* @param env - environment mapping used to read `DSH_HOME`.
* @returns the normalized absolute harness home path.
*/
function resolveDshHome(configured, env = process.env) {
	const fromEnv = env[DSH_HOME_ENV];
	return resolve(expandHomePath(configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())));
}
/**
* Join path segments onto the resolved DeepSeek Harness home.
* @param segments - path segments appended to the Harness home; an empty list returns the home itself.
* @returns the normalized absolute joined path.
*/
function dshHomePath(...segments) {
	return join(resolveDshHome(), ...segments);
}
//#endregion
//#region src/update-endpoint.ts
/**
* Host-side self-update endpoint for @dsh-external/dsh-minigames.
*
* GET  /dsh-minigames/latest  -> { latest: "vX.Y.Z" | null }  (git ls-remote)
* POST /dsh-minigames/update  { "tag": "vX.Y.Z" }             (pinned install)
* Only this plugin's own fixed tag is ever installed; a local link install is
* detected and skipped (auto-update would sever the developer link).
*/
const UPDATE_PATH = "/dsh-minigames/update";
const LATEST_PATH = "/dsh-minigames/latest";
const PACKAGE_SPEC = "@dsh-external/dsh-minigames";
const MIRROR = "lhh010/dsh-minigames";
const REPO_GIT = `https://github.com/${MIRROR}.git`;
function semverCompare(a, b) {
	const parse = (v) => {
		const p = v.replace(/^v/, "").split(".").map((x) => Number(x) || 0);
		while (p.length < 3) p.push(0);
		return p;
	};
	const pa = parse(a);
	const pb = parse(b);
	return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}
/** TTL cache for the ls-remote result; failures are cached too, so an offline
* machine answers instantly instead of blocking every page load on DNS/TCP. */
const CACHE_TTL_MS = 6e4;
const GIT_TIMEOUT_MS = 8e3;
let latestCache;
let latestInflight;
function latestFromGit() {
	if (latestCache !== void 0 && Date.now() - latestCache.at < CACHE_TTL_MS) return Promise.resolve(latestCache.latest);
	if (latestInflight !== void 0) return latestInflight;
	latestInflight = new Promise((resolve) => {
		execFile("git", [
			"ls-remote",
			"--tags",
			REPO_GIT
		], {
			encoding: "utf8",
			maxBuffer: 1048576,
			timeout: GIT_TIMEOUT_MS,
			killSignal: "SIGKILL"
		}, (error, stdout) => {
			latestInflight = void 0;
			let latest;
			if (error === null && typeof stdout === "string") for (const line of stdout.split("\n")) {
				const trimmed = line.trim();
				if (trimmed.length === 0) continue;
				const match = trimmed.match(/refs\/tags\/(v\d+\.\d+\.\d+)$/);
				if (match !== null && (latest === void 0 || semverCompare(match[1], latest) > 0)) latest = match[1];
			}
			latestCache = {
				at: Date.now(),
				latest
			};
			resolve(latest);
		});
	});
	return latestInflight;
}
function isLinkInstall() {
	try {
		const p = resolve(dshHomePath("profiles", "web", "node_modules", "@dsh-external"), "dsh-minigames");
		return realpathSync(p) !== resolve(p);
	} catch {
		return false;
	}
}
function runInstall(tag) {
	return new Promise((resolve) => {
		if (isLinkInstall()) {
			resolve({
				ok: false,
				output: "",
				link: true
			});
			return;
		}
		const child = spawn("pnpm", ["add", `${PACKAGE_SPEC}@github:${MIRROR}#${tag}`], {
			cwd: dshHomePath("profiles", "web"),
			shell: true
		});
		let output = "";
		let settled = false;
		const settle = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {}
			settle({
				ok: false,
				output: `${output}安装超时（120s）`,
				link: false
			});
		}, 12e4);
		child.stdout?.on("data", (c) => {
			output += c.toString();
		});
		child.stderr?.on("data", (c) => {
			output += c.toString();
		});
		child.on("error", (e) => {
			clearTimeout(timer);
			settle({
				ok: false,
				output: `${output}${String(e)}`,
				link: false
			});
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			settle({
				ok: code === 0,
				output,
				link: false
			});
		});
	});
}
function readBody(req) {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (c) => {
			body += c.toString();
			if (body.length > 4096) reject(/* @__PURE__ */ new Error("body too large"));
		});
		req.on("end", () => {
			resolve(body);
		});
	});
}
function registerUpdateEndpoint(ctx) {
	ctx.effect(() => {
		const latestDispose = ctx.webServer.register({
			kind: "exact",
			path: LATEST_PATH,
			handler: (_req, res) => {
				latestFromGit().then((latest) => {
					const body = `${JSON.stringify({ latest: latest ?? null })}\n`;
					res.writeHead(200, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store"
					});
					res.end(body);
				});
			}
		});
		const dispose = ctx.webServer.register({
			kind: "exact",
			path: UPDATE_PATH,
			handler: async (req, res) => {
				const send = (status, value) => {
					const body = `${JSON.stringify(value)}\n`;
					res.writeHead(status, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store"
					});
					res.end(body);
				};
				if (req.method !== "POST") {
					send(405, {
						ok: false,
						error: "method not allowed"
					});
					return;
				}
				try {
					const tag = JSON.parse(await readBody(req)).tag;
					if (typeof tag !== "string" || !/^v\d+\.\d+\.\d+$/.test(tag)) {
						send(400, {
							ok: false,
							error: "invalid tag"
						});
						return;
					}
					const result = await runInstall(tag);
					send(result.link ? 200 : result.ok ? 200 : 500, {
						ok: result.ok,
						link: result.link,
						output: result.output.slice(-4e3),
						tag
					});
				} catch (e) {
					send(400, {
						ok: false,
						error: String(e?.message ?? e)
					});
				}
			}
		});
		return () => {
			dispose();
			latestDispose();
		};
	}, "ui-whale: update endpoint");
}
//#endregion
//#region src/index.ts
/** Stable Cordis plugin name (the loader row id). */
const name = "dsh-minigames";
/** The web server is required before the update endpoint can register. */
const inject = ["webServer"];
/**
* Activate the node half: register the update endpoint and log activation.
* @param ctx - plugin context.
*/
function apply(ctx) {
	registerUpdateEndpoint(ctx);
	ctx.logger.info("[dsh-minigames] node half active; the game panel mounts in the browser");
}
//#endregion
export { apply, inject, name };
