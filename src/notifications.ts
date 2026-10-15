import type { Env } from "./model";
import { money, record } from "./model";
import { sendReceipt } from "./email";
export function orderMessage(o: any) {
  return `UniGlobe Fashion · UGF-${o.id}\n${o.created_at} UTC\n${o.customer.name}\nPhone: ${o.customer.phone}\nWhatsApp: ${o.customer.whatsapp || "—"}\nEmail: ${o.customer.email || "—"}\n${o.customer.address}, ${o.customer.city}, ${o.customer.region} ${o.customer.postalCode}, ${o.customer.country}\n\n${o.items.map((i: any) => `${i.name} ${i.variant} × ${i.quantity} — ${money(i.price * i.quantity)}`).join("\n")}\n\nTotal: ${money(o.total)}\nNotes: ${o.customer.notes || "—"}\nYour order has already been received.`;
}

// Keep UTF-16 length under Telegram's limit without splitting a surrogate pair.
export function telegramChunks(body: string) {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of body) {
    if (chunk.length + character.length > 3900) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

async function deliverJob(env: Env, job: any, deadline: number) {
  const claimTime = Date.now();
  const lease = claimTime + 120000;
  const claimed = await env.DB.prepare(
    "UPDATE outbox SET status='sending',lease_until=?,attempts=attempts+1 WHERE id=? AND lease_until<? AND next_attempt<=? AND attempts<5 AND status IN ('pending','retry','sending') RETURNING attempts,progress,payload",
  )
    .bind(lease, job.id, claimTime, claimTime)
    .first<any>();
  if (!claimed) return;
  let retryAfter = 0;
  try {
    const config = await record(env.DB, "ordering");
    let payload = claimed.payload ? JSON.parse(claimed.payload) : null;
    if (!payload) {
      const row = await env.DB.prepare("SELECT * FROM orders WHERE id=?")
        .bind(job.order_id)
        .first<any>();
      if (!row) throw new Error("Order unavailable");
      const o = {
        ...row,
        customer: JSON.parse(row.customer),
        items: JSON.parse(row.items),
      };
      const details = orderMessage(o);
      // A single replacement pass preserves customer text containing template tokens.
      const variables: Record<string, string> = {
        orderNumber: `UGF-${o.id}`,
        customerName: o.customer.name,
        orderDetails: details,
      };
      const template = (value: string) =>
        value.replace(
          /\{(orderNumber|customerName|orderDetails)\}/g,
          (_, key) => variables[key],
        );
      payload = {
        body: template(
          (job.channel === "telegram"
            ? config.telegramTemplate
            : config.emailTemplate) || "{orderDetails}",
        ),
        subject: template(
          config.emailSubject || "Order received · {orderNumber}",
        ),
        sender: config.emailSender,
      };
      await env.DB.prepare(
        "UPDATE outbox SET payload=? WHERE id=? AND lease_until=? AND attempts=?",
      )
        .bind(JSON.stringify(payload), job.id, lease, claimed.attempts)
        .run();
    }
    if (job.channel === "telegram") {
      if (!config?.telegramEnabled || !env.TELEGRAM_BOT_TOKEN)
        throw new Error("Telegram transport not configured");
      const chunks = telegramChunks(payload.body);
      for (let i = claimed.progress; i < chunks.length; i++) {
        if (Date.now() > deadline - 10000) {
          await env.DB.prepare(
            "UPDATE outbox SET status='pending',attempts=attempts-1,next_attempt=0,lease_until=0 WHERE id=? AND lease_until=? AND attempts=?",
          )
            .bind(job.id, lease, claimed.attempts)
            .run();
          return;
        }
        const response = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            redirect: "error",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: job.destination,
              text: chunks[i],
              link_preview_options: { is_disabled: true },
            }),
            signal: AbortSignal.timeout(10000),
          },
        );
        const result = (await response.json()) as any;
        if (!response.ok || !result.ok) {
          retryAfter = Math.min(
            86400000,
            Math.max(0, Number(result.parameters?.retry_after) || 0) * 1000,
          );
          throw new Error("Telegram delivery rejected");
        }
        const saved = await env.DB.prepare(
          "UPDATE outbox SET progress=? WHERE id=? AND lease_until=? AND attempts=?",
        )
          .bind(i + 1, job.id, lease, claimed.attempts)
          .run();
        if (!saved.meta.changes) return;
      }
    } else if (job.channel === "email") {
      if (!config?.emailEnabled || !payload.sender)
        throw new Error("Email transport not configured");
      await sendReceipt(env, {
        from: payload.sender,
        to: job.destination,
        subject: payload.subject,
        text: payload.body,
        id: job.id,
      });
    } else throw new Error("Unsupported notification channel");
    await env.DB.prepare(
      "UPDATE outbox SET status='sent',sent_at=CURRENT_TIMESTAMP,error=NULL,lease_until=0 WHERE id=? AND lease_until=? AND attempts=?",
    )
      .bind(job.id, lease, claimed.attempts)
      .run();
  } catch (error) {
    const message =
      error instanceof Error &&
      [
        "Telegram transport not configured",
        "Email transport not configured",
        "HTTPS email transport required",
        "Telegram delivery rejected",
        "Email delivery rejected",
        "Order unavailable",
      ].includes(error.message)
        ? error.message
        : "Delivery failed; check transport configuration";
    await env.DB.prepare(
      "UPDATE outbox SET status=?,error=?,next_attempt=?,lease_until=0 WHERE id=? AND lease_until=? AND attempts=?",
    )
      .bind(
        claimed.attempts >= 5 ? "failed" : "retry",
        message,
        Date.now() +
          Math.max(
            retryAfter,
            Math.min(3600000, 60000 * 2 ** (claimed.attempts - 1)),
          ),
        job.id,
        lease,
        claimed.attempts,
      )
      .run();
  }
}

export async function deliver(env: Env) {
  const now = Date.now();
  // Recover a process terminated during its final attempt; it must be visible
  // as failed in admin instead of remaining in 'sending' forever.
  await env.DB.prepare(
    "UPDATE outbox SET status='failed',error='Delivery interrupted after final attempt',lease_until=0 WHERE status='sending' AND attempts>=5 AND lease_until<?",
  )
    .bind(now)
    .run();
  const jobs = await env.DB.prepare(
    "SELECT * FROM outbox WHERE status IN ('pending','retry','sending') AND attempts<5 AND next_attempt<=? AND lease_until<? ORDER BY next_attempt, rowid LIMIT 20",
  )
    .bind(now, now)
    .all<any>();
  const deadline = now + 25000;
  // Bound post-response waitUntil work; cron resumes remaining jobs/chunks.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < jobs.results.length && Date.now() < deadline - 10000) {
        const job = jobs.results[cursor++];
        await deliverJob(env, job, deadline);
      }
    }),
  );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM rate_limits WHERE reset_at<?").bind(
      Math.floor(now / 1000) - 86400,
    ),
    env.DB.prepare("DELETE FROM totp_used WHERE step<?").bind(
      Math.floor(now / 30000) - 3,
    ),
  ]);
}
