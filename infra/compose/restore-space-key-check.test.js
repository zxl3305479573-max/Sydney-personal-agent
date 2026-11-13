const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const checker = path.join(__dirname, "restore-space-key-check.js");
const key = "synthetic-encryption-key-only";
const master = crypto.hkdfSync("sha256", Buffer.from(key), Buffer.from("rakazo"),
                               "rakazo/content-master-key/v1", 32);
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv("aes-256-gcm", master, iv);
cipher.setAAD(Buffer.from(`rakazo/space-key/v1\0synthetic-space\0${1}`));
const dataKey = crypto.randomBytes(32);
const wrapped = Buffer.concat([iv, cipher.update(dataKey),
                               cipher.final(), cipher.getAuthTag()]).toString("base64url");
const records = [{ id: "synthetic-key", spaceId: "synthetic-space", version: 1, masterKeyId: "env", wrappedKey: wrapped }];
function run(encryptionKey, inputRecords, messages) {
  return spawnSync(process.execPath, [checker], {
    input: JSON.stringify({ encryptionKey, records: inputRecords, messages }), encoding: "utf8",
  });
}
const valid = run(key, records);
assert.equal(valid.status, 0);
assert.equal(valid.stdout.trim(), "space_keys_verified=1");
assert.notEqual(run("wrong-synthetic-key", records).status, 0);
assert.notEqual(run(key, [{ ...records[0], spaceId: "wrong-space" }]).status, 0);
assert.notEqual(run(key, [{ ...records[0], masterKeyId: "other" }]).status, 0);
assert.notEqual(run(key, []).status, 0);
const messageIv = crypto.randomBytes(12);
const messageCipher = crypto.createCipheriv("aes-256-gcm", dataKey, messageIv);
messageCipher.setAAD(Buffer.from(["rakazo/content/v1", "messages", "blocks",
                                  "synthetic-row", "synthetic-thread", "synthetic-space"].join("\0")));
const body = Buffer.concat([messageIv, messageCipher.update('{"kind":"text","text":"synthetic"}'),
                            messageCipher.final(), messageCipher.getAuthTag()]).toString("base64url");
const message = { ciphertext: `rkz1:synthetic-key:${body}`, rowId: "synthetic-row",
                  threadId: "synthetic-thread", spaceId: "synthetic-space" };
const validMessage = run(key, records, [message]);
assert.equal(validMessage.status, 0);
assert.match(validMessage.stdout, /encrypted_message_blocks_verified=1/);
assert.notEqual(run(key, records, [{ ...message, rowId: "wrong-row" }]).status, 0);
assert.notEqual(run(key, records, [{ ...message, spaceId: "wrong-space" }]).status, 0);
assert.notEqual(run(key, records, [{ ...message, ciphertext: `${message.ciphertext.slice(0, -4)}AAAA` }]).status, 0);
console.log("synthetic_key_and_message_checks=9");
