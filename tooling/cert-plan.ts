/**
 * Plan for creating a locally-trusted TLS certificate for localhost.
 *
 * 1. Create a throwaway certificate authority whose *name constraints* only
 *    permit it to vouch for localhost and 127.0.0.1. Even if its key leaked,
 *    it couldn't be used to impersonate any other site.
 * 2. Sign a localhost server certificate with it.
 * 3. Delete the CA's private key, so no further certificates can ever be
 *    issued from it. Only the server's own key remains, in .secrets/.
 * 4. Trust the CA in the user's login keychain (macOS prompts for approval).
 *
 * Re-running replaces everything, including the keychain entry.
 */
import type { Step } from "./plan.ts";

export const caCommonName = "Home Page Localhost CA";

/** Apple's maximum lifetime for locally-trusted TLS server certs. */
const validDays = "825";

const caConfig = `[req]
distinguished_name = dn
prompt = no
[dn]
CN = ${caCommonName}
[v3_ca]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical, permitted;DNS:localhost, permitted;IP:127.0.0.1/255.255.255.255
`;

const leafConfig = `[req]
distinguished_name = dn
prompt = no
[dn]
CN = localhost
[v3_leaf]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost, IP:127.0.0.1
authorityKeyIdentifier = keyid
`;

export type CertPaths = {
  readonly secretsDir: string;
  readonly caCertFile: string;
  readonly certFile: string;
  readonly keyFile: string;
  /** e.g. ~/Library/Keychains/login.keychain-db */
  readonly keychain: string;
};

export const certPlan = (
  paths: CertPaths,
  /** Random hex serial number for the leaf certificate. */
  serial: string,
): ReadonlyArray<Step> => {
  const tmp = (name: string) => `${paths.secretsDir}/${name}`;
  const caKey = tmp("ca-key.pem");
  const caCnf = tmp("ca.cnf");
  const leafCnf = tmp("leaf.cnf");
  const csr = tmp("localhost.csr");
  const run = (cmd: string, args: ReadonlyArray<string>, mayFail = false) => ({
    is: "run" as const,
    cmd,
    args,
    mayFail,
  });
  return [
    { is: "mkdir", path: paths.secretsDir },
    { is: "write", path: caCnf, text: caConfig, mode: 0o600 },
    { is: "write", path: leafCnf, text: leafConfig, mode: 0o600 },
    run("openssl", [
      "req",
      "-x509",
      "-new",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-days",
      validDays,
      "-config",
      caCnf,
      "-extensions",
      "v3_ca",
      "-keyout",
      caKey,
      "-out",
      paths.caCertFile,
    ]),
    run("openssl", [
      "req",
      "-new",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-config",
      leafCnf,
      "-keyout",
      paths.keyFile,
      "-out",
      csr,
    ]),
    run("openssl", [
      "x509",
      "-req",
      "-sha256",
      "-days",
      validDays,
      "-in",
      csr,
      "-CA",
      paths.caCertFile,
      "-CAkey",
      caKey,
      "-set_serial",
      `0x${serial}`,
      "-extfile",
      leafCnf,
      "-extensions",
      "v3_leaf",
      "-out",
      paths.certFile,
    ]),
    run("chmod", ["600", paths.keyFile]),
    { is: "remove", path: caKey },
    { is: "remove", path: csr },
    { is: "remove", path: caCnf },
    { is: "remove", path: leafCnf },
    // Remove a previously trusted CA from an earlier run, if any.
    run("security", ["delete-certificate", "-c", caCommonName, paths.keychain], true),
    run("security", [
      "add-trusted-cert",
      "-r",
      "trustRoot",
      "-p",
      "ssl",
      "-k",
      paths.keychain,
      paths.caCertFile,
    ]),
  ];
};
