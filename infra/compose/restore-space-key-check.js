const crypto = require("node:crypto");

try {
  const chunks = [];
  let size = 0;
  process.stdin.on("data", (chunk) => {
    size += chunk.length;
    if (size > 1024 * 1024) process.exit(1);
    chunks.push(chunk);
  });
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (typeof input.encryptionKey !== "string" || !input.encryptionKey ||
          !Array.isArray(input.records) || input.records.length === 0) throw new Error();
      const master = crypto.hkdfSync(
        "sha256", Buffer.from(input.encryptionKey, "utf8"), Buffer.from("rakazo"),
        "rakazo/content-master-key/v1", 32,
      );
      let verified = 0;
      const dataKeys = new Map();
      for (const record of input.records) {
        if (record.masterKeyId !== "env" || typeof record.spaceId !== "string" ||
            !Number.isSafeInteger(record.version) || typeof record.wrappedKey !== "string" ||
            (input.messages && (typeof record.id !== "string" || dataKeys.has(record.id)))) {
          throw new Error();
        }
        const body = Buffer.from(record.wrappedKey, "base64url");
        if (body.length !== 60) throw new Error();
        const decipher = crypto.createDecipheriv("aes-256-gcm", master, body.subarray(0, 12));
        decipher.setAAD(Buffer.from(`rakazo/space-key/v1\0${record.spaceId}\0${record.version}`));
        decipher.setAuthTag(body.subarray(body.length - 16));
        const result = Buffer.concat([decipher.update(body.subarray(12, body.length - 16)),
                                      decipher.final()]);
        if (result.length !== 32) throw new Error();
        if (input.messages) dataKeys.set(record.id, { key: result, spaceId: record.spaceId });
        else result.fill(0);
        verified += 1;
      }
      console.log(`space_keys_verified=${verified}`);
      if (input.messages) {
        if (!Array.isArray(input.messages) || input.messages.length > 25) throw new Error();
        let decrypted = 0;
        for (const message of input.messages) {
          if (typeof message.ciphertext !== "string" || !message.ciphertext.startsWith("rkz1:") ||
              typeof message.rowId !== "string" || typeof message.threadId !== "string" ||
              typeof message.spaceId !== "string") throw new Error();
          const separator = message.ciphertext.indexOf(":", 5);
          if (separator <= 5) throw new Error();
          const record = dataKeys.get(message.ciphertext.slice(5, separator));
          if (!record || record.spaceId !== message.spaceId) throw new Error();
          const body = Buffer.from(message.ciphertext.slice(separator + 1), "base64url");
          if (body.length < 28) throw new Error();
          const decipher = crypto.createDecipheriv("aes-256-gcm", record.key, body.subarray(0, 12));
          decipher.setAAD(Buffer.from(["rakazo/content/v1", "messages", "blocks", message.rowId,
                                       message.threadId, message.spaceId].join("\0")));
          decipher.setAuthTag(body.subarray(body.length - 16));
          const plaintext = Buffer.concat([decipher.update(body.subarray(12, body.length - 16)),
                                           decipher.final()]);
          JSON.parse(plaintext.toString("utf8"));
          plaintext.fill(0);
          decrypted += 1;
        }
        for (const record of dataKeys.values()) record.key.fill(0);
        console.log(`encrypted_message_blocks_verified=${decrypted}`);
      }
    } catch {
      console.error("Space-key verification failed.");
      process.exitCode = 1;
    }
  });
} catch {
  console.error("Space-key verification failed.");
  process.exitCode = 1;
}
