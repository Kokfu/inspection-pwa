import net from "node:net";
import tls from "node:tls";
import { validEmail } from "./reminderCore.js";

export class SmtpFailure extends Error {
  constructor(readonly category: "auth" | "connection" | "tls" | "timeout" | "smtp_rejected", readonly uncertain: boolean) {
    super(category);
  }
}

type Socket = net.Socket | tls.TLSSocket;
class Replies {
  private buffer = "";
  private lines: string[] = [];
  private terminalError?: Error;
  private waiting?: { resolve: (line: string) => void; reject: (error: Error) => void };
  constructor(private socket: Socket) {
    socket.setTimeout(15000);
    socket.on("timeout", () => this.fail(new SmtpFailure("timeout", false)));
    socket.on("error", () => this.fail(new SmtpFailure("connection", false)));
    socket.on("close", () => this.fail(new SmtpFailure("connection", false)));
    socket.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      if (this.buffer.length > 65536) { this.fail(new SmtpFailure("smtp_rejected", false)); return; }
      let end: number;
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end).replace(/\r$/, "");
        this.buffer = this.buffer.slice(end + 1);
        if (this.waiting) { const waiter = this.waiting; this.waiting = undefined; waiter.resolve(line); }
        else this.lines.push(line);
      }
    });
  }
  private fail(error: Error) { this.terminalError = error; if (this.waiting) { const waiter = this.waiting; this.waiting = undefined; waiter.reject(error); } }
  private line(): Promise<string> {
    const line = this.lines.shift();
    if (line !== undefined) return Promise.resolve(line);
    if (this.terminalError) return Promise.reject(this.terminalError);
    return new Promise((resolve, reject) => { this.waiting = { resolve, reject }; });
  }
  async expect(code: number, category: SmtpFailure["category"] = "smtp_rejected") {
    for (;;) {
      const line = await this.line();
      if (!/^\d{3}[ -]/.test(line)) throw new SmtpFailure(category, false);
      if (Number(line.slice(0, 3)) !== code) throw new SmtpFailure(category, false);
      if (line[3] === " ") return;
    }
  }
  async command(command: string, code: number, category?: SmtpFailure["category"]) {
    this.socket.write(`${command}\r\n`);
    await this.expect(code, category);
  }
}

function connect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "smtp.gmail.com", port: 587 });
    const timer = setTimeout(() => { socket.destroy(); reject(new SmtpFailure("timeout", false)); }, 15000);
    socket.once("connect", () => { clearTimeout(timer); resolve(socket); });
    socket.once("error", () => { clearTimeout(timer); reject(new SmtpFailure("connection", false)); });
  });
}

function secure(socket: net.Socket): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({ socket, host: "smtp.gmail.com", servername: "smtp.gmail.com", rejectUnauthorized: true });
    const timer = setTimeout(() => { tlsSocket.destroy(); reject(new SmtpFailure("timeout", false)); }, 15000);
    tlsSocket.once("secureConnect", () => { clearTimeout(timer); resolve(tlsSocket); });
    tlsSocket.once("error", () => { clearTimeout(timer); reject(new SmtpFailure("tls", false)); });
  });
}

type MailInput = { sender: string; password: string; recipient: string; subject: string; body: string };
type SmtpTransport = { connect: () => Promise<net.Socket>; secure: (socket: net.Socket) => Promise<Socket> };

/** Test seam for the SMTP dialogue. Production always supplies the fixed Gmail transport below. */
export async function sendGmailWithTransport(input: MailInput, transport: SmtpTransport): Promise<void> {
  if (!validEmail(input.sender) || !validEmail(input.recipient)) throw new SmtpFailure("smtp_rejected", false);
  let socket: Socket | undefined;
  let handedOff = false;
  try {
    socket = await transport.connect();
    let replies = new Replies(socket);
    await replies.expect(220, "connection");
    await replies.command("EHLO inspection-reminder", 250, "connection");
    await replies.command("STARTTLS", 220, "tls");
    socket = await transport.secure(socket);
    replies = new Replies(socket);
    await replies.command("EHLO inspection-reminder", 250, "tls");
    await replies.command("AUTH LOGIN", 334, "auth");
    await replies.command(Buffer.from(input.sender).toString("base64"), 334, "auth");
    await replies.command(Buffer.from(input.password).toString("base64"), 235, "auth");
    await replies.command(`MAIL FROM:<${input.sender}>`, 250);
    await replies.command(`RCPT TO:<${input.recipient}>`, 250);
    await replies.command("DATA", 354);
    const subject = input.subject.replace(/[\r\n]/g, " ");
    const body = input.body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const encodedBody = Buffer.from(body).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
    const message = `From: <${input.sender}>\r\nTo: <${input.recipient}>\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedBody}\r\n.\r\n`;
    handedOff = true;
    socket.write(message);
    await replies.expect(250);
    handedOff = false;
    socket.write("QUIT\r\n");
  } catch (error) {
    if (error instanceof SmtpFailure) throw new SmtpFailure(error.category, (handedOff && error.category !== "smtp_rejected" && error.category !== "auth") || error.uncertain);
    throw new SmtpFailure("connection", handedOff);
  } finally { socket?.destroy(); }
}

export function sendGmail(input: MailInput): Promise<void> {
  return sendGmailWithTransport(input, { connect, secure });
}
