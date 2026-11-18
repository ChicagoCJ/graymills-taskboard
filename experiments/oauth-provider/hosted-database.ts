import { X509Certificate } from "node:crypto";
import type { PoolConfig } from "pg";

// The caller separately validates the approved host and restricted username.
// pg connection-string SSL parameters override an explicit ssl object, so the
// hosted URL's query must not be allowed to replace this certificate policy.
export function hostedDatabaseOptions(databaseUrl: string, pem: string | undefined): PoolConfig {
  const certificate = pem?.trim();
  if (!certificate || certificate.length > 20000 ||
      !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(certificate) ||
      (certificate.match(/-----BEGIN CERTIFICATE-----/g)?.length ?? 0) !== 1) {
    throw new Error("The hosted database CA certificate is missing or invalid.");
  }
  try {
    const ca = new X509Certificate(certificate);
    if (!ca.ca || Date.parse(ca.validFrom) > Date.now() || Date.parse(ca.validTo) <= Date.now()) {
      throw new Error("Invalid certificate");
    }
  } catch {
    throw new Error("The hosted database CA certificate is missing or invalid.");
  }
  const url = new URL(databaseUrl);
  url.search = "";
  url.hash = "";
  return { connectionString: url.toString(), ssl: { ca: certificate, rejectUnauthorized: true } };
}
