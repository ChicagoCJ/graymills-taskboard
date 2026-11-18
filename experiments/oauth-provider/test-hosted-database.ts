import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { Client } from "pg";
import { hostedDatabaseOptions } from "./hosted-database";

const folder = mkdtempSync(join(tmpdir(), "oauth-ca-test-"));
const certPath = join(folder, "ca.crt");
const keyPath = join(folder, "key.pem");
let server: tls.Server | undefined;
try {
  // Ephemeral local fixture: neither key nor certificate enters source control.
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost", "-addext", "basicConstraints=critical,CA:TRUE"],
  { stdio: "ignore" });
  const certificate = readFileSync(certPath, "utf8");
  const url = "postgres://chatgpt_oauth_runtime.disposable:fixture@approved.example.test:5432/postgres";
  for (const invalid of [undefined, "", "not a certificate", certificate + certificate]) {
    assert.throws(() => hostedDatabaseOptions(url, invalid), /CA certificate/);
  }
  const config = hostedDatabaseOptions(url + "?sslmode=no-verify&sslrootcert=untrusted-file&uselibpqcompat=true", certificate);
  assert.equal(new URL(config.connectionString!).search, "");
  assert.deepEqual(config.ssl, { ca: certificate.trim(), rejectUnauthorized: true });
  const pg = new Client(config);
  assert.deepEqual(pg.ssl, config.ssl, "pg must preserve the verified CA settings");

  server = tls.createServer({ cert: certificate, key: readFileSync(keyPath) });
  server.on("tlsClientError", () => {});
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  function connect(options: tls.ConnectionOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host: "127.0.0.1", port, ...options }, () => {
        assert.equal(socket.authorized, true);
        socket.destroy();
        resolve();
      });
      socket.setTimeout(5000, () => socket.destroy(new Error("TLS fixture timed out")));
      socket.once("error", reject);
    });
  }
  const ssl = config.ssl as tls.ConnectionOptions;
  await connect({ ...ssl, servername: "localhost" });
  await assert.rejects(connect({ rejectUnauthorized: true, servername: "localhost" }));
  await assert.rejects(connect({ ...ssl, servername: "wrong.example.test" }),
    (error: NodeJS.ErrnoException) => error.code === "ERR_TLS_CERT_ALTNAME_INVALID");
  console.log("PASS: explicit CA verifies TLS, rejects an untrusted certificate and wrong hostname, and survives pg URL parsing.");
} finally {
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  rmSync(folder, { recursive: true, force: true });
}
