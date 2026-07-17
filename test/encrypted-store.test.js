import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EncryptedStore } from "../server/encrypted-store.js";

test("EncryptedStore persists values without writing secrets in plaintext", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gdoc-store-test-"));
  const file = path.join(dir, "state.enc.json");
  const key = Buffer.alloc(32, 7).toString("base64");
  try {
    const store = new EncryptedStore(file, key);
    await store.mutate((data) => { data.google.user = { refreshToken: "not-on-disk" }; });
    assert.equal((await store.read()).google.user.refreshToken, "not-on-disk");
    assert.doesNotMatch(await fs.promises.readFile(file, "utf8"), /not-on-disk/);
    assert.equal((await fs.promises.stat(file)).mode & 0o777, 0o600);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
