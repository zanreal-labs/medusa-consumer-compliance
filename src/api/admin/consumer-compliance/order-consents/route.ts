import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { complianceService } from "../../../lib/views";

const COLUMNS = [
  "order_id",
  "key",
  "version",
  "required",
  "purpose",
  "locale",
  "accepted_at",
  "ip",
  "user_agent",
  "link_url",
  "link_sha256",
  "covered_product_ids",
  "text",
] as const;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join(" ") : value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r;]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseDate(value: unknown, name: string): Date | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `${name} must be an ISO date.`);
  }
  return date;
}

/**
 * GET /admin/consumer-compliance/order-consents?order_id=&key=&from=&to=&offset=&limit=&format=csv
 *
 * Export of the order consent snapshots, as JSON (paginated) or CSV (up to
 * 10 000 rows per request; page with offset).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const filters: Record<string, unknown> = {};
  if (typeof req.query.order_id === "string") {
    filters.order_id = req.query.order_id;
  }
  if (typeof req.query.key === "string") {
    filters.key = req.query.key;
  }
  const from = parseDate(req.query.from, "from");
  const to = parseDate(req.query.to, "to");
  if (from || to) {
    filters.accepted_at = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  }
  const csv = req.query.format === "csv";
  const limit = Math.min(csv ? 10000 : 500, Math.max(1, Number(req.query.limit ?? (csv ? 10000 : 100)) || 100));
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  const [rows, count] = await complianceService(req.scope).listAndCountOrderConsents(filters, {
    order: { accepted_at: "ASC" },
    skip: offset,
    take: limit,
  });
  if (csv) {
    const lines = [COLUMNS.join(";"), ...rows.map((row) => COLUMNS.map((column) => csvCell((row as Record<string, unknown>)[column])).join(";"))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="order-consents.csv"');
    res.send(`﻿${lines.join("\r\n")}\r\n`);
    return;
  }
  res.json({ count, limit, offset, order_consents: rows });
}
