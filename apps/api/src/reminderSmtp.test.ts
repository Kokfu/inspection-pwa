import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";
import { sendGmailWithTransport, SmtpFailure } from "./reminderSmtp.js";

async function fakeSmtp(rejectAuth = false) {
  const commands: string[] = [];
  const message: string[] = [];
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.write("220 fake.example.test SMTP ready\r\n");
    let buffer = "";
    let phase: "greeting" | "auth-user" | "auth-pass" | "message" | "commands" = "greeting";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ""); buffer = buffer.slice(end + 1);
        if (phase === "message") {
          if (line === ".") { phase = "commands"; socket.write("250 queued as fake-id\r\n"); }
          else message.push(line);
          continue;
        }
        commands.push(line);
        if (line.startsWith("EHLO")) { phase = "commands"; socket.write("250-fake.example.test\r\n250 AUTH LOGIN\r\n"); }
        else if (line === "STARTTLS") socket.write("220 Begin TLS\r\n");
        else if (line === "AUTH LOGIN") { phase = "auth-user"; socket.write("334 VXNlcm5hbWU6\r\n"); }
        else if (phase === "auth-user") { phase = "auth-pass"; socket.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (phase === "auth-pass") { phase = "commands"; socket.write(rejectAuth ? "535 authentication failed\r\n" : "235 authenticated\r\n"); }
        else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) socket.write("250 accepted\r\n");
        else if (line === "DATA") { phase = "message"; socket.write("354 End data with dot\r\n"); }
        else if (line === "QUIT") { socket.write("221 bye\r\n"); socket.end(); }
      }
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const transport = {
    connect: () => new Promise<net.Socket>((resolve, reject) => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.once("connect", () => resolve(socket)); socket.once("error", reject);
    }),
    // The fake server tests SMTP sequencing; production secure() performs real
    // STARTTLS with certificate verification against smtp.gmail.com.
    secure: async (socket: net.Socket) => socket
  };
  return { commands, message, transport, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const input = { sender: "sender@gmail.com", password: "fake-app-password", recipient: "tech@example.test", subject: "Service reminder: Customer — 2026-09-29", body: "The next service date is 2026-09-29.\r\n" };

test("fake SMTP accepts one private message through EHLO, STARTTLS, AUTH, DATA", async () => {
  const server = await fakeSmtp();
  try {
    await sendGmailWithTransport(input, server.transport);
    assert.equal(server.commands.filter((line) => line.startsWith("EHLO")).length, 2);
    assert.ok(server.commands.includes("STARTTLS"));
    assert.ok(server.commands.includes(`MAIL FROM:<${input.sender}>`));
    assert.ok(server.commands.includes(`RCPT TO:<${input.recipient}>`));
    assert.ok(server.commands.includes(Buffer.from(input.password).toString("base64")));
    assert.ok(server.message.includes(`To: <${input.recipient}>`));
    assert.equal(server.message.some((line) => line.startsWith("Cc:") || line.startsWith("Bcc:")), false);
    const bodyStart = server.message.indexOf("") + 1;
    assert.match(Buffer.from(server.message.slice(bodyStart).join(""), "base64").toString("utf8"), /next service date is 2026-09-29/);
  } finally { await server.close(); }
});

test("fake SMTP auth rejection is a definite failed handoff", async () => {
  const server = await fakeSmtp(true);
  try {
    await assert.rejects(() => sendGmailWithTransport(input, server.transport), (error: unknown) => error instanceof SmtpFailure && error.category === "auth" && !error.uncertain);
    assert.equal(server.commands.some((line) => line.startsWith("MAIL FROM")), false);
  } finally { await server.close(); }
});
