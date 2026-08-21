import { connect } from "cloudflare:sockets";
import type { GuestLanguage, MessagePurpose } from "../domain/guest-contract";
import { assertTestRecipient, normalizeWhatsAppNumber } from "./message-delivery-policy";
import { getRuntimeEnv, type RuntimeEnv } from "./runtime-env";

export type DeliveryResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; status: "failed" | "delivery-unknown"; error: string };

type DeliveryContext = {
  purpose: MessagePurpose;
  language: GuestLanguage;
  variables: Record<string, string>;
};

type WhatsAppWorkflow = {
  url: string;
  name: string;
  language: string;
  phoneField?: string;
};

const ACELE_HOST_SUFFIX = "acele.in";
const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const PROVIDER_TIMEOUT_MS = 20_000;

export function deliveryConfiguration(env: RuntimeEnv = getRuntimeEnv()) {
  const mode = env.MESSAGE_DELIVERY_MODE?.trim();
  return {
    configured: mode === "test" || mode === "production",
    mode: mode === "test" || mode === "production" ? mode : "unconfigured",
    whatsapp: Boolean(env.WHATSAPP_ACELE_API_KEY?.trim() && env.WHATSAPP_ACELE_PHONE_NUMBER_ID?.trim()),
    email: Boolean(env.EMAIL_SMTP_USERNAME?.trim() && env.EMAIL_SMTP_APP_PASSWORD?.trim() && env.EMAIL_FROM_ADDRESS?.trim()),
  } as const;
}

export async function deliverWhatsApp(
  to: string,
  body: string,
  context: DeliveryContext,
  env: RuntimeEnv = getRuntimeEnv(),
): Promise<DeliveryResult> {
  try {
    assertTestRecipient("whatsapp", to, env);
    const credentials = aceleCredentials(env);
    if (env.MESSAGE_DELIVERY_MODE === "test") {
      return await postAceleText(credentials, normalizeWhatsAppNumber(to), body);
    }
    const workflow = workflowFor(context.purpose, context.language, env);
    if (!workflow) return { ok: false, status: "failed", error: "A Meta-approved WhatsApp template workflow is not configured." };
    return await postAceleWorkflow(workflow, normalizeWhatsAppNumber(to), context.variables);
  } catch (error) {
    return { ok: false, status: "failed", error: safeError(error) };
  }
}

export async function deliverEmail(
  to: string,
  subject: string,
  body: string,
  env: RuntimeEnv = getRuntimeEnv(),
): Promise<DeliveryResult> {
  try {
    assertTestRecipient("email", to, env);
    const username = required(env.EMAIL_SMTP_USERNAME, "Email SMTP username");
    const password = required(env.EMAIL_SMTP_APP_PASSWORD, "Email SMTP app password").replace(/\s/gu, "");
    const fromAddress = required(env.EMAIL_FROM_ADDRESS, "Email sender address");
    const fromName = env.EMAIL_FROM_NAME?.trim() || "YIL Golden Jubilee";
    const providerMessageId = await sendSmtpMessage({ username, password, fromAddress, fromName, to, subject, body });
    return { ok: true, providerMessageId };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof SmtpDeliveryUnknownError ? "delivery-unknown" : "failed",
      error: safeError(error),
    };
  }
}

function aceleCredentials(env: RuntimeEnv) {
  const base = new URL(env.WHATSAPP_ACELE_BASE_URL?.trim() || "https://app.acele.in/api/v1");
  if (base.protocol !== "https:" || !allowedAceleHost(base.hostname) || base.username || base.password || base.hash) {
    throw new Error("The Acele API URL is invalid.");
  }
  return {
    base: base.toString().replace(/\/+$/u, ""),
    apiKey: required(env.WHATSAPP_ACELE_API_KEY, "Acele API key"),
    phoneNumberId: required(env.WHATSAPP_ACELE_PHONE_NUMBER_ID, "Acele phone number ID"),
  };
}

async function postAceleText(credentials: ReturnType<typeof aceleCredentials>, to: string, message: string): Promise<DeliveryResult> {
  const form = new URLSearchParams({
    apiToken: credentials.apiKey,
    phone_number_id: credentials.phoneNumberId,
    phone_number: to,
    message,
  });
  return postAcele(`${credentials.base}/whatsapp/send`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });
}

async function postAceleWorkflow(workflow: WhatsAppWorkflow, to: string, variables: Record<string, string>): Promise<DeliveryResult> {
  const url = new URL(workflow.url);
  if (url.protocol !== "https:" || !allowedAceleHost(url.hostname) || url.username || url.password || url.hash) {
    return { ok: false, status: "failed", error: "The WhatsApp template workflow URL is invalid." };
  }
  return postAcele(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      ...variables,
      [workflow.phoneField?.trim() || "phone_number"]: to,
      template_name: workflow.name,
      template_language: workflow.language,
    }),
    redirect: "manual",
  });
}

async function postAcele(url: string, init: RequestInit): Promise<DeliveryResult> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    return { ok: false, status: "delivery-unknown", error: `${safeError(error)}; the provider may have accepted the message, so it was not retried.` };
  }
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, status: "delivery-unknown", error: `Acele returned HTTP ${response.status} with a redirect that was not followed; delivery is unknown, so the message was not retried.` };
  }
  let payload: { status?: string | number; wa_message_id?: string; message_id?: string; message?: string };
  try {
    payload = await response.json() as typeof payload;
  } catch {
    return { ok: false, status: "delivery-unknown", error: `Acele returned HTTP ${response.status} without a valid delivery response.` };
  }
  if (response.ok && String(payload.status) === "1") {
    return { ok: true, providerMessageId: payload.wa_message_id || payload.message_id || `acele-${crypto.randomUUID()}` };
  }
  return { ok: false, status: "failed", error: String(payload.message || `Acele rejected the message with HTTP ${response.status}.`).slice(0, 500) };
}

function workflowFor(purpose: MessagePurpose, language: GuestLanguage, env: RuntimeEnv): WhatsAppWorkflow | null {
  const raw = env.WHATSAPP_TEMPLATE_WORKFLOWS_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, WhatsAppWorkflow>;
    const workflow = parsed[`${purpose}:${language}`];
    return workflow && typeof workflow.url === "string" && typeof workflow.name === "string" && typeof workflow.language === "string" ? workflow : null;
  } catch {
    throw new Error("WhatsApp template workflow configuration is invalid.");
  }
}

function allowedAceleHost(hostname: string) {
  const host = hostname.toLocaleLowerCase("en-IN");
  return host === ACELE_HOST_SUFFIX || host.endsWith(`.${ACELE_HOST_SUFFIX}`);
}

type SmtpMessage = {
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
};

class SmtpDeliveryUnknownError extends Error {}

async function sendSmtpMessage(message: SmtpMessage) {
  for (const value of [message.username, message.fromAddress, message.fromName, message.to, message.subject]) {
    if (/\r|\n/u.test(value)) throw new Error("Email headers contain an invalid line break.");
  }
  if (!emailAddress(message.fromAddress) || !emailAddress(message.to)) throw new Error("Email sender or recipient is invalid.");
  const socket = connect({ hostname: SMTP_HOST, port: SMTP_PORT }, { secureTransport: "on", allowHalfOpen: false });
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const smtp = new SmtpProtocol(reader, writer);
  let dataStarted = false;
  try {
    await withTimeout(socket.opened, PROVIDER_TIMEOUT_MS, "SMTP connection");
    await smtp.expect([220], "SMTP greeting");
    await smtp.command("EHLO yil-golden-jubilee", [250], "SMTP greeting");
    await smtp.command("AUTH LOGIN", [334], "SMTP authentication");
    await smtp.command(base64Text(message.username), [334], "SMTP username", true);
    await smtp.command(base64Text(message.password), [235], "SMTP password", true);
    await smtp.command(`MAIL FROM:<${message.fromAddress}>`, [250], "SMTP sender");
    await smtp.command(`RCPT TO:<${message.to}>`, [250, 251], "SMTP recipient");
    await smtp.command("DATA", [354], "SMTP message data");
    dataStarted = true;
    const messageId = `${crypto.randomUUID()}@${message.fromAddress.split("@")[1]}`;
    await smtp.write(`${mimeMessage(message, messageId)}\r\n.\r\n`);
    await smtp.expect([250], "SMTP delivery acceptance");
    dataStarted = false;
    await smtp.command("QUIT", [221], "SMTP quit").catch(() => undefined);
    return messageId;
  } catch (error) {
    if (dataStarted) throw new SmtpDeliveryUnknownError(`${safeError(error)}; SMTP delivery status is unknown, so the message was not retried.`);
    throw error;
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    await socket.close().catch(() => undefined);
  }
}

class SmtpProtocol {
  private buffer = "";
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly writer: WritableStreamDefaultWriter<Uint8Array>,
  ) {}

  async command(command: string, expected: number[], label: string, sensitive = false) {
    await this.write(`${command}\r\n`);
    try {
      return await this.expect(expected, label);
    } catch (error) {
      if (sensitive) throw new Error(`${label} failed.`);
      throw error;
    }
  }

  async write(value: string) {
    await withTimeout(this.writer.write(new TextEncoder().encode(value)), PROVIDER_TIMEOUT_MS, "SMTP write");
  }

  async expect(expected: number[], label: string) {
    const first = await this.line();
    const code = Number(first.slice(0, 3));
    let final = first;
    if (/^\d{3}-/u.test(first)) {
      do { final = await this.line(); } while (!final.startsWith(`${first.slice(0, 3)} `));
    }
    if (!expected.includes(code)) throw new Error(`${label} failed with SMTP ${Number.isFinite(code) ? code : "response"}.`);
    return final;
  }

  private async line(): Promise<string> {
    while (!this.buffer.includes("\r\n")) {
      const result = await withTimeout(this.reader.read(), PROVIDER_TIMEOUT_MS, "SMTP response");
      if (result.done) throw new Error("SMTP closed the connection unexpectedly.");
      this.buffer += this.decoder.decode(result.value, { stream: true });
      if (this.buffer.length > 64_000) throw new Error("SMTP response exceeded the safe limit.");
    }
    const index = this.buffer.indexOf("\r\n");
    const line = this.buffer.slice(0, index);
    this.buffer = this.buffer.slice(index + 2);
    return line;
  }
}

function mimeMessage(message: SmtpMessage, messageId: string) {
  const subject = encodedHeader(message.subject);
  const fromName = encodedHeader(message.fromName);
  const body = base64Text(message.body.replace(/\r?\n/gu, "\r\n")).replace(/.{1,76}/gu, "$&\r\n").trimEnd();
  return [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    `From: ${fromName} <${message.fromAddress}>`,
    `To: <${message.to}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
}

function encodedHeader(value: string) {
  return /^[\x20-\x7E]*$/u.test(value) ? value : `=?UTF-8?B?${base64Text(value)}?=`;
}

function base64Text(value: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function emailAddress(value: string) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(value);
}

function required(value: string | undefined, label: string) {
  const clean = value?.trim();
  if (!clean) throw new Error(`${label} is not configured.`);
  return clean;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
