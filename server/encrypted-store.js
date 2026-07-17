import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function encryptionKey(value) {
  if (!value) throw new Error("DATA_ENCRYPTION_KEY is required");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 random bytes encoded as base64");
  return key;
}

export class EncryptedStore {
  constructor(file, key = process.env.DATA_ENCRYPTION_KEY) {
    this.file = file;
    this.key = encryptionKey(key);
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      const payload = JSON.parse(await fs.promises.readFile(this.file, "utf8"));
      const iv = Buffer.from(payload.iv, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      const cleartext = Buffer.concat([
        decipher.update(Buffer.from(payload.data, "base64")),
        decipher.final(),
      ]);
      return JSON.parse(cleartext.toString("utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return { clients: {}, pending: {}, codes: {}, tokens: {}, google: {} };
      throw error;
    }
  }

  async write(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const payload = JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    });
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary, payload, { mode: 0o600 });
    await fs.promises.rename(temporary, this.file);
  }

  mutate(callback) {
    const operation = this.queue.then(async () => {
      const value = await this.read();
      const result = await callback(value);
      await this.write(value);
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
