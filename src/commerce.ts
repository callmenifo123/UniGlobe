import { z } from "zod";
import { localized, imagePath, L, type Product } from "./model";
const translated = localized.default(L(""));
const image = z.union([imagePath, z.literal("")]).default("");
export const taxonomySchema = z.object({
  name: localized.refine(
    (v) => !!v.en.trim(),
    "An English name is required for fallback",
  ),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120)
    .optional(),
  description: translated,
  cover: image,
  hero: image,
  visible: z.boolean().default(true),
  archived: z.boolean().default(false),
  priority: z.number().int().min(-10000).max(10000).default(0),
  homepageVisible: z.boolean().default(false),
  homepagePriority: z.number().int().default(0),
  seoTitle: translated,
  seoDescription: translated,
});
export const badgeStyles = [
  "accent",
  "urgent",
  "sale",
  "premium",
  "neutral",
] as const;
export const badgePresets = [
  "New arrival",
  "Limited quantity",
  "Limited discount",
  "Sale",
  "Best seller",
  "Exclusive",
  "Back in stock",
  "Trending",
  "Featured",
  "New drop",
] as const;
export const badgeSchema = z.object({
  name: localized.refine(
    (v) => !!v.en.trim(),
    "An English name is required for fallback",
  ),
  style: z.enum(badgeStyles),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(0),
});
export const sectionTypes = [
  "hero",
  "featured-collection",
  "new-arrivals",
  "product-spotlight",
  "editorial-split",
  "shop-by-category",
  "featured-products",
  "promotional-banner",
  "limited-drop",
  "sale-highlight",
  "image-story",
  "collection-grid",
] as const;
export const sectionSchema = z.object({
  type: z.enum(sectionTypes),
  title: localized.refine((v) => !!v.en.trim(), "A section title is required"),
  subtitle: translated,
  eyebrow: translated,
  cta: translated,
  image,
  secondaryImage: image,
  href: z
    .string()
    .max(1000)
    .refine((v) => v === "" || /^\/(?!\/)/.test(v) || /^https:\/\//.test(v))
    .default(""),
  collection: z.string().max(120).default(""),
  products: z.array(z.string().uuid()).max(24).default([]),
  taxonomies: z.array(z.string().max(120)).max(24).default([]),
  visible: z.boolean().default(true),
  priority: z.number().int().min(-10000).max(10000).default(0),
  layout: z.enum(["editorial", "wide", "split", "grid"]).default("editorial"),
});
export const deliverySchema = z.object({
  name: z.string().min(1).max(100),
  country: z.enum(["LK", "SA"]),
  region: z.string().max(100).default(""),
  fee: z.number().int().min(0).max(100000000),
  freeAbove: z.number().int().min(0).max(100000000).nullable().default(null),
  enabled: z.boolean().default(false),
  priority: z.number().int().default(0),
});
export async function entries(
  db: D1Database,
  kind: string,
  publicOnly = false,
) {
  const rows = (
    await db
      .prepare("SELECT id,data,version FROM records WHERE kind=?")
      .bind(kind)
      .all<any>()
  ).results;
  return rows
    .map((r) => ({ ...JSON.parse(r.data), id: r.id, version: r.version, kind }))
    .filter(
      (r) =>
        !publicOnly ||
        (r.visible !== false && !r.archived && r.enabled !== false),
    )
    .sort(
      (a, b) =>
        (a.priority || 0) - (b.priority || 0) || a.id.localeCompare(b.id),
    );
}
export function member(p: Product, id: string) {
  return p.collection === id || p.collections?.includes(id);
}
export function activeBadges(
  p: Product,
  definitions: any[],
  placement: "card" | "page",
  now = Date.now(),
) {
  return (p.badges || [])
    .filter(
      (b) =>
        b.enabled &&
        b[placement] &&
        (!b.start || Date.parse(b.start) <= now) &&
        (!b.end || Date.parse(b.end) > now),
    )
    .map((b) => ({
      ...definitions.find((d) => d.id === b.id),
      priority: b.priority,
    }))
    .filter((b) => b.name && b.enabled !== false)
    .sort((a, b) => a.priority - b.priority);
}
export function deliveryQuote(
  rules: any[],
  country: string,
  region: string,
  subtotal: number,
) {
  const applicable = rules
    .filter(
      (r) =>
        r.enabled &&
        r.country === country &&
        (!r.region ||
          r.region.trim().toLowerCase() === region.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(!!b.region) - Number(!!a.region) || a.priority - b.priority,
    );
  const r = applicable[0];
  return r
    ? {
        fee: r.freeAbove !== null && subtotal >= r.freeAbove ? 0 : r.fee,
        ruleId: r.id,
        name: r.name,
      }
    : null;
}
