import { checkoutSchema, products, record } from "./model";
import type { Env } from "./model";
import { hash, random } from "./security";
export async function placeOrder(env: Env, body: unknown) {
  const data = checkoutSchema.parse(body);
  const requestHash = await hash(JSON.stringify(data));
  const existing = await env.DB.prepare(
    "SELECT token,request_hash FROM orders WHERE idempotency=?",
  )
    .bind(data.key)
    .first<any>();
  if (existing) {
    if (existing.request_hash !== requestHash)
      throw new Error(
        "This checkout key was already used for a different order",
      );
    return existing.token;
  }
  const settings = await record(env.DB, "ordering");
  if (!settings?.enabled)
    throw new Error("Ordering is not open yet. Please check back soon.");
  if (!settings.countries.includes(data.customer.country))
    throw new Error("Delivery is not available for this country");
  const catalog = await products(env.DB);
  let total = 0;
  const seen = new Set();
  const items = data.items.map((line) => {
    const key = line.productId + ":" + line.variantId;
    if (seen.has(key)) throw new Error("Duplicate bag item");
    seen.add(key);
    const p = catalog.find((x) => x.id === line.productId);
    const v = p?.variants.find((v) => v.id === line.variantId);
    if (
      !p ||
      !v ||
      !v.available ||
      !p.countries.includes(data.customer.country)
    )
      throw new Error("An item is no longer available for this destination");
    const price = p.salePrice ?? p.price;
    total += price * line.quantity;
    return {
      productId: p.id,
      variantId: v.id,
      name: p.name.en,
      variant:
        [v.size, v.color].filter(Boolean).join(" / ") ||
        "Details to be confirmed",
      quantity: line.quantity,
      price,
      image: p.images[0] || "",
      version: p.version,
    };
  });
  const token = random();
  const batch: D1PreparedStatement[] = [];
  // A CHECK constraint makes insufficient stock abort the entire transaction.
  for (const item of items) {
    batch.push(
      env.DB.prepare(
        "UPDATE inventory SET quantity=CASE WHEN quantity IS NULL THEN NULL ELSE quantity-? END WHERE product_id=? AND variant_id=?",
      ).bind(item.quantity, item.productId, item.variantId),
    );
    // Abort on concurrent catalog edits, including price, availability or variant changes.
    batch.push(
      env.DB.prepare(
        "INSERT INTO inventory(product_id,variant_id,quantity) SELECT ?,?, -1 WHERE NOT EXISTS(SELECT 1 FROM products WHERE id=? AND version=?)",
      ).bind(
        item.productId,
        "guard-" + random(8),
        item.productId,
        item.version,
      ),
    );
  }
  for (const id of new Set(items.map((i) => i.productId)))
    batch.push(
      env.DB.prepare(
        "UPDATE products SET inventory_revision=inventory_revision+1 WHERE id=?",
      ).bind(id),
    );
  batch.push(
    env.DB.prepare(
      "INSERT INTO orders(token,idempotency,request_hash,customer,items,total) VALUES(?,?,?,?,?,?)",
    ).bind(
      token,
      data.key,
      requestHash,
      JSON.stringify(data.customer),
      JSON.stringify(items),
      total,
    ),
  );
  const jobs: { channel: string; destination: string }[] = [];
  if (settings.emailEnabled) {
    for (const destination of settings.emailRecipients)
      jobs.push({ channel: "email", destination });
    if (data.customer.email)
      jobs.push({ channel: "email", destination: data.customer.email });
  }
  if (settings.telegramEnabled)
    for (const destination of settings.telegramChats)
      jobs.push({ channel: "telegram", destination });
  for (const job of jobs)
    batch.push(
      env.DB.prepare(
        "INSERT INTO outbox(id,order_id,channel,destination) SELECT ?,id,?,? FROM orders WHERE token=?",
      ).bind(random(16), job.channel, job.destination, token),
    );
  try {
    await env.DB.batch(batch);
  } catch {
    const existing = await env.DB.prepare(
      "SELECT token,request_hash FROM orders WHERE idempotency=?",
    )
      .bind(data.key)
      .first<any>();
    if (existing?.request_hash === requestHash) return existing.token;
    throw new Error(
      "An item changed or has insufficient stock. Refresh your bag and try again.",
    );
  }
  return token;
}
