type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type FetchFn = (input: any, init?: any) => Promise<any>;
const fetchFn: FetchFn | null = (globalThis as any)?.fetch ? (globalThis as any).fetch.bind(globalThis) : null;

function emailDebugEnabled(): boolean {
  const v = String(process.env.EMAIL_DEBUG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isProd() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

function getEmailFrom(): string {
  return String(process.env.EMAIL_FROM ?? "no-reply@feedverse.app").trim();
}

function getEmailReplyTo(): string | null {
  const v = String(process.env.EMAIL_REPLY_TO ?? "").trim();
  return v ? v : null;
}

function getEmailProvider(): "resend" | "noop" {
  const forced = String(process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "resend") return "resend";
  if (forced === "noop") return "noop";

  // Auto-detect.
  const resendKey = String(process.env.RESEND_API_KEY ?? "").trim();
  if (resendKey) return "resend";
  return "noop";
}

async function sendViaResend(args: SendEmailArgs): Promise<boolean> {
  const apiKey = String(process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error("[email] RESEND_API_KEY is missing; cannot send via Resend");
    return false;
  }

  if (!fetchFn) {
    // eslint-disable-next-line no-console
    console.error("[email] Global fetch is not available; cannot send via Resend");
    return false;
  }

  const from = getEmailFrom();
  const replyTo = getEmailReplyTo();

  const payload: any = {
    from,
    to: [args.to],
    subject: args.subject,
    text: args.text,
  };
  if (args.html) payload.html = args.html;
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error("[email] Resend failed", res.status, body);
    return false;
  }

  return true;
}

async function sendViaNoop(args: SendEmailArgs): Promise<boolean> {
  // In non-prod, logging the email helps during development.
  // In prod, noop should be considered misconfiguration.
  if (!isProd()) {
    // eslint-disable-next-line no-console
    console.log("[email] noop send", {
      to: args.to,
      subject: args.subject,
      text: args.text,
    });
  } else {
    // eslint-disable-next-line no-console
    console.error(
      "[email] EMAIL_PROVIDER resolved to noop in production; email will NOT be sent. Check EMAIL_PROVIDER/RESEND_API_KEY.",
    );
  }
  return !isProd();
}

export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  const to = String(args.to ?? "").trim();
  if (!to) return false;

  const provider = getEmailProvider();

  if (emailDebugEnabled()) {
    // eslint-disable-next-line no-console
    console.log("[email] sendEmail", {
      provider,
      from: getEmailFrom(),
      to,
      subject: args.subject,
      hasHtml: Boolean(args.html),
      nodeEnv: String(process.env.NODE_ENV ?? "").trim(),
    });
  }

  if (provider === "resend") return sendViaResend(args);
  return sendViaNoop(args);
}

export function buildPasswordResetEmail(args: { code: string; expiresMinutes: number }) {
  const code = String(args.code ?? "").trim();
  const expiresMinutes = Math.max(1, Number(args.expiresMinutes) || 15);

  const subject = "Your Feedverse password reset code";
  const text = `Your Feedverse password reset code is: ${code}\n\nThis code expires in ${expiresMinutes} minutes. If you did not request this, you can ignore this email.`;

  const html = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4;">
    <h2 style="margin: 0 0 12px;">Password reset</h2>
    <p style="margin: 0 0 12px;">Your Feedverse password reset code is:</p>
    <div style="font-size: 28px; letter-spacing: 4px; font-weight: 700; margin: 8px 0 16px;">${code}</div>
    <p style="margin: 0 0 12px; color: #444;">This code expires in ${expiresMinutes} minutes.</p>
    <p style="margin: 0; color: #666; font-size: 12px;">If you did not request this, you can ignore this email.</p>
  </div>
  `.trim();

  return { subject, text, html };
}

export function buildPasswordChangeEmail(args: { code: string; expiresMinutes: number }) {
  const code = String(args.code ?? "").trim();
  const expiresMinutes = Math.max(1, Number(args.expiresMinutes) || 10);

  const subject = "Your Feedverse password change code";
  const text = `Your Feedverse password change code is: ${code}\n\nThis code expires in ${expiresMinutes} minutes. If you did not request this, please change your password and review sessions.`;

  const html = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4;">
    <h2 style="margin: 0 0 12px;">Confirm password change</h2>
    <p style="margin: 0 0 12px;">Enter this code to confirm your password change:</p>
    <div style="font-size: 28px; letter-spacing: 4px; font-weight: 700; margin: 8px 0 16px;">${code}</div>
    <p style="margin: 0 0 12px; color: #444;">This code expires in ${expiresMinutes} minutes.</p>
    <p style="margin: 0; color: #666; font-size: 12px;">If you did not request this, please secure your account.</p>
  </div>
  `.trim();

  return { subject, text, html };
}

export function buildSignupVerifyEmail(args: { code: string; expiresMinutes: number }) {
  const code = String(args.code ?? "").trim();
  const expiresMinutes = Math.max(1, Number(args.expiresMinutes) || 10);

  const subject = "Your Feedverse verification code";
  const text = `Your Feedverse verification code is: ${code}\n\nThis code expires in ${expiresMinutes} minutes. If you did not request this, you can ignore this email.`;

  const html = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4;">
    <h2 style="margin: 0 0 12px;">Verify your email</h2>
    <p style="margin: 0 0 12px;">Enter this code to finish creating your Feedverse account:</p>
    <div style="font-size: 28px; letter-spacing: 4px; font-weight: 700; margin: 8px 0 16px;">${code}</div>
    <p style="margin: 0 0 12px; color: #444;">This code expires in ${expiresMinutes} minutes.</p>
    <p style="margin: 0; color: #666; font-size: 12px;">If you did not request this, you can ignore this email.</p>
  </div>
  `.trim();

  return { subject, text, html };
}

export function buildEmailVerifyEmail(args: { code: string; expiresMinutes: number }) {
  const code = String(args.code ?? "").trim();
  const expiresMinutes = Math.max(1, Number(args.expiresMinutes) || 10);

  const subject = "Verify your Feedverse email";
  const text = `Your Feedverse email verification code is: ${code}\n\nThis code expires in ${expiresMinutes} minutes. If you did not request this, you can ignore this email.`;

  const html = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4;">
    <h2 style="margin: 0 0 12px;">Verify your email</h2>
    <p style="margin: 0 0 12px;">Enter this code to verify your email on Feedverse:</p>
    <div style="font-size: 28px; letter-spacing: 4px; font-weight: 700; margin: 8px 0 16px;">${code}</div>
    <p style="margin: 0 0 12px; color: #444;">This code expires in ${expiresMinutes} minutes.</p>
    <p style="margin: 0; color: #666; font-size: 12px;">If you did not request this, you can ignore this email.</p>
  </div>
  `.trim();

  return { subject, text, html };
}

export function buildEmailChangeVerifyEmail(args: { code: string; expiresMinutes: number }) {
  const code = String(args.code ?? "").trim();
  const expiresMinutes = Math.max(1, Number(args.expiresMinutes) || 10);

  const subject = "Confirm your new Feedverse email";
  const text = `Your Feedverse email change code is: ${code}\n\nThis code expires in ${expiresMinutes} minutes. If you did not request this, please secure your account.`;

  const html = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4;">
    <h2 style="margin: 0 0 12px;">Confirm email change</h2>
    <p style="margin: 0 0 12px;">Enter this code to confirm your new email address:</p>
    <div style="font-size: 28px; letter-spacing: 4px; font-weight: 700; margin: 8px 0 16px;">${code}</div>
    <p style="margin: 0 0 12px; color: #444;">This code expires in ${expiresMinutes} minutes.</p>
    <p style="margin: 0; color: #666; font-size: 12px;">If you did not request this, please secure your account.</p>
  </div>
  `.trim();

  return { subject, text, html };
}
