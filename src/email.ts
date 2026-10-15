import type { Env } from "./model";

export type ReceiptEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  id: string;
};

export function emailConfigured(env: Env) {
  return (
    !!env.ORDER_EMAIL ||
    !!(env.EMAIL_API_TOKEN && env.EMAIL_API_URL?.startsWith("https://"))
  );
}

// Native Workers SendEmail binding first; the HTTPS adapter supports accounts
// whose approved sending provider exposes the documented JSON contract.
export async function sendReceipt(env: Env, email: ReceiptEmail) {
  const subject = email.subject.replace(/[\r\n]+/g, " ").slice(0, 250);
  if (env.ORDER_EMAIL) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        env.ORDER_EMAIL.send({
          from: email.from,
          to: email.to,
          subject,
          text: email.text,
          headers: {
            "Message-ID": `<uniglobe-${email.id}@${new URL(env.SITE_URL).hostname}>`,
          },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Email delivery timed out")),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    return;
  }
  if (!env.EMAIL_API_TOKEN || !env.EMAIL_API_URL)
    throw new Error("Email transport not configured");
  const url = new URL(env.EMAIL_API_URL);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("HTTPS email transport required");
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_TOKEN}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.id,
    },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Email delivery rejected");
}
