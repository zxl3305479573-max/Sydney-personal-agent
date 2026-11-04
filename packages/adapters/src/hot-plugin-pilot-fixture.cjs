const readline = require("node:readline");

const mode = process.argv[2];
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "hello") {
    if (mode === "no-handshake") return;
    process.stdout.write(
      `${JSON.stringify({ type: "ready", version: mode === "bad-version" ? 2 : 1 })}\n`,
    );
    return;
  }
  if (message.type !== "extract") return;
  if (mode === "crash") {
    process.exit(1);
  }
  if (mode === "hang") return;
  if (mode === "big-output") {
    process.stdout.write(`${"x".repeat(70 * 1024)}\n`);
    return;
  }
  const headings = message.text
    .split(/\r?\n/)
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, ""));
  const respond = () => {
    process.stdout.write(`${JSON.stringify({ type: "result", id: message.id, headings })}\n`);
  };
  if (mode === "slow") setTimeout(respond, 100);
  else respond();
});
