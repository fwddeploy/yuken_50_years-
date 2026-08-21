/* Staged private-production capacity check. Credentials are read once from
 * stdin as JSON and are never accepted as command-line arguments or logged.
 * Expected input: {"confirm":"YIL-PRIVATE-PRODUCTION","bypassToken":"...",
 * "employeeNumber":"...","pin":"..."}
 */
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const line = await new Promise((resolve, reject) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { data += chunk; const end = data.search(/[\r\n]/u); if (end >= 0) resolve(data.slice(0, end)); });
  process.stdin.on("error", reject);
});
if (process.stdin.isTTY) process.stdin.setRawMode(false);
process.stdin.pause();

const input = JSON.parse(line);
if (input.confirm !== "YIL-PRIVATE-PRODUCTION") throw new Error("Production load test confirmation is missing.");
for (const field of ["bypassToken", "employeeNumber", "pin"]) if (!input[field]) throw new Error(`${field} is required.`);

const baseUrl = "https://yil-golden-jubilee-ops.tech-sinisters.chatgpt.site";
const stages = [10, 25, 40, 75, 100];
const results = [];
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
};
const summary = (records, elapsedMs) => {
  const times = records.filter(record => record.ok).map(record => record.ms);
  return {
    attempted: records.length,
    succeeded: records.filter(record => record.ok).length,
    failed: records.filter(record => !record.ok).length,
    statuses: Object.fromEntries([...new Set(records.map(record => record.status))].sort().map(status => [status, records.filter(record => record.status === status).length])),
    p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95), p99Ms: percentile(times, 0.99),
    maxMs: times.length ? Math.round(Math.max(...times)) : null,
    wallMs: Math.round(elapsedMs),
    requestsPerSecond: elapsedMs > 0 ? Number((records.length / (elapsedMs / 1000)).toFixed(2)) : null,
  };
};
async function timed(path, init = {}) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "OAI-Sites-Authorization": `Bearer ${input.bypassToken}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(45_000) });
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, ms: performance.now() - started, headers: response.headers };
  } catch (error) { return { ok: false, status: "network", ms: performance.now() - started, error: error instanceof Error ? error.name : "Error" }; }
}
function sessionCookie(headers) {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  for (const value of values) { const match = value.match(/(?:^|,\s*)(__Host-yil_session=[^;]*)/u); if (match) return match[1]; }
  return "";
}

for (const concurrency of stages) {
  const loginStart = performance.now();
  const logins = await Promise.all(Array.from({ length: concurrency }, () => timed("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeNumber: input.employeeNumber, pin: input.pin }) })));
  const cookies = logins.map(result => result.ok ? sessionCookie(result.headers) : "").filter(Boolean);
  const firstStart = performance.now();
  const first = await Promise.all(cookies.map((cookie, index) => timed(index % 2 ? "/api/guest/snapshot" : "/api/event/snapshot", { headers: { Cookie: cookie } })));
  const secondStart = performance.now();
  const second = await Promise.all(cookies.map((cookie, index) => timed(index % 2 ? "/api/event/snapshot" : "/api/guest/snapshot", { headers: { Cookie: cookie } })));
  const logoutStart = performance.now();
  const logouts = await Promise.all(cookies.map(cookie => timed("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } })));
  results.push({ concurrency, login: summary(logins, firstStart - loginStart), firstSnapshotWave: summary(first, secondStart - firstStart), secondSnapshotWave: summary(second, logoutStart - secondStart), logout: summary(logouts, performance.now() - logoutStart) });
  await new Promise(resolve => setTimeout(resolve, 1500));
}
const totals = results.reduce((total, stage) => {
  for (const key of ["login", "firstSnapshotWave", "secondSnapshotWave", "logout"]) { total.attempted += stage[key].attempted; total.succeeded += stage[key].succeeded; total.failed += stage[key].failed; }
  return total;
}, { attempted: 0, succeeded: 0, failed: 0 });
console.log(JSON.stringify({ target: baseUrl, dataClassification: "test fixture", stages, totals, results }));
process.exitCode = totals.failed ? 1 : 0;
