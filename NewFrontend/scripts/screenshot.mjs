// Screenshot + smoke harness. Signs in through the app's own /api proxy (so the httpOnly cookie is real),
// then captures each route and records console errors, page errors and failed /api requests.
//
// Usage:
//   SHOT_PHONE=9000000002 SHOT_PASSWORD=… node scripts/screenshot.mjs [outDir] [--viewport=1586x992] [--guest] name=/route …
// The password is the backend's SEED_DEMO_PASSWORD; it is never stored in this repository.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.SHOT_BASE ?? "http://localhost:3100";
const args = process.argv.slice(2);
const guest = args.includes("--guest");
const vp = (args.find((a) => a.startsWith("--viewport=")) ?? "--viewport=1586x992").split("=")[1].split("x").map(Number);
const routes = args.filter((a) => !a.startsWith("--") && a.includes("=")).map((a) => a.split("="));
const outDir = path.resolve(args.find((a) => !a.includes("=") && !a.startsWith("--")) ?? "docs/screenshots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--force-device-scale-factor=1", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: vp[0], height: vp[1], deviceScaleFactor: 1 });

let problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`));
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/") && r.status() >= 400) problems.push(`api ${r.status()} ${new URL(u).pathname}${new URL(u).search}`);
});

if (!guest) {
  const phone = process.env.SHOT_PHONE ?? "9000000002";
  const password = process.env.SHOT_PASSWORD;
  if (!password) throw new Error("Set SHOT_PASSWORD (the backend's SEED_DEMO_PASSWORD) or pass --guest");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  const status = await page.evaluate(
    async (phone, password) =>
      (
        await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone, password }),
        })
      ).status,
    phone,
    password,
  );
  if (status !== 200) throw new Error(`login failed with status ${status}`);
  console.log(`signed in as ${phone}`);
}

const lang = (args.find((a) => a.startsWith("--lang=")) ?? "").split("=")[1];
if (lang) await page.evaluate((l) => localStorage.setItem("kisan-mitra-lang", l), lang);

const targets = routes.length ? routes : [["dashboard", "/"]];
let failures = 0;
for (const [name, route] of targets) {
  problems = [];
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => document.fonts?.ready);
  await new Promise((r) => setTimeout(r, 1200));
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: args.includes("--full") });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) problems.push(`horizontal overflow ${overflow}px`);
  const rawKeys = await page.evaluate(() =>
    [...document.body.innerText.matchAll(/\b(?:dash|health|market|prices|enquiries|advice|assistant|auth|content|admin|help|common|nav|header)\.[a-zA-Z]+(?:\.[a-zA-Z]+)*\b/g)]
      .map((m) => m[0])
      .slice(0, 5),
  );
  if (rawKeys.length) problems.push(`untranslated keys: ${rawKeys.join(", ")}`);
  failures += problems.length ? 1 : 0;
  console.log(`${problems.length ? "WARN" : "ok  "} ${route} -> ${path.relative(process.cwd(), file)}`);
  for (const p of problems) console.log(`       ${p}`);
}

await browser.close();
process.exitCode = failures ? 1 : 0;
