import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261019114200 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "consumer_compliance_unit_pricing" drop constraint if exists "consumer_compliance_unit_pricing_variant_id_unique";`);
    this.addSql(`alter table if exists "consumer_compliance_product" drop constraint if exists "consumer_compliance_product_product_id_unique";`);
    this.addSql(`alter table if exists "consumer_compliance_price_history" drop constraint if exists "consumer_compliance_price_history_variant_id_context_key_unique";`);
    this.addSql(`create table if not exists "consumer_compliance_operator" ("id" text not null, "role" text check ("role" in ('manufacturer', 'responsible_person', 'importer')) not null, "name" text not null, "trade_name" text null, "postal_address" text null, "country_code" text null, "email" text null, "url" text null, "phone" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_operator_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_operator_deleted_at" ON "consumer_compliance_operator" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "consumer_compliance_price_history" ("id" text not null, "amount" numeric not null, "context_key" text not null, "currency_code" text not null, "kind" text check ("kind" in ('observed', 'external')) not null default 'observed', "note" text null, "original_amount" numeric null, "price_list_id" text null, "price_list_type" text null, "product_id" text null, "region_id" text null, "source" text check ("source" in ('event', 'sweep', 'backfill', 'manual')) not null default 'event', "tax_inclusive" boolean not null default false, "valid_from" timestamptz not null, "valid_to" timestamptz null, "variant_id" text not null, "raw_amount" jsonb not null, "raw_original_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_price_history_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_price_history_deleted_at" ON "consumer_compliance_price_history" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_price_history_variant_id_context_key_valid_from" ON "consumer_compliance_price_history" ("variant_id", "context_key", "valid_from") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_price_history_product_id" ON "consumer_compliance_price_history" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consumer_compliance_price_history_variant_id_context_key_unique" ON "consumer_compliance_price_history" ("variant_id", "context_key") WHERE valid_to IS NULL AND kind = 'observed' AND deleted_at IS NULL;`);

    this.addSql(`create table if not exists "consumer_compliance_product" ("id" text not null, "product_id" text not null, "gpsr_not_applicable" boolean not null default false, "manufacturer_id" text null, "responsible_person_id" text null, "product_identifier" text null, "warnings" jsonb null, "safety_information" jsonb null, "no_warnings_required" boolean not null default false, "safety_document_urls" text[] null, "accessibility_notes" jsonb null, "omnibus_mode" text check ("omnibus_mode" in ('standard', 'perishable', 'exempt')) not null default 'standard', "withdrawal_exception" text check ("withdrawal_exception" in ('none', 'custom_made', 'perishable', 'sealed_hygiene', 'inseparably_mixed', 'alcohol_market_price', 'sealed_media', 'periodicals', 'digital_content')) not null default 'none', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_product_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_product_deleted_at" ON "consumer_compliance_product" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consumer_compliance_product_product_id_unique" ON "consumer_compliance_product" ("product_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "consumer_compliance_settings" ("id" text not null, "reviews_disclosure" jsonb null, "reviews_enabled" boolean not null default false, "personalised_pricing_disclosure" jsonb null, "personalised_pricing_used" boolean not null default false, "withdrawal_info" jsonb null, "omnibus_note" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_settings_deleted_at" ON "consumer_compliance_settings" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "consumer_compliance_unit_pricing" ("id" text not null, "variant_id" text not null, "product_id" text null, "net_quantity" numeric null, "net_unit" text check ("net_unit" in ('g', 'kg', 'ml', 'l', 'cm', 'm', 'm2', 'm3', 'piece')) null, "drained_quantity" numeric null, "reference_unit" text check ("reference_unit" in ('auto', 'kg', 'per_100g', 'l', 'per_100ml', 'm', 'm2', 'm3', 'piece', 'per_10_pieces', 'per_100_pieces')) not null default 'auto', "exempt_reason" text check ("exempt_reason" in ('none', 'same_as_price', 'sold_as_set', 'sold_in_pairs', 'medicinal_product')) not null default 'none', "deposit_amount" numeric null, "deposit_currency_code" text not null default 'pln', "raw_net_quantity" jsonb null, "raw_drained_quantity" jsonb null, "raw_deposit_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_unit_pricing_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_unit_pricing_deleted_at" ON "consumer_compliance_unit_pricing" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consumer_compliance_unit_pricing_variant_id_unique" ON "consumer_compliance_unit_pricing" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_unit_pricing_product_id" ON "consumer_compliance_unit_pricing" ("product_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "consumer_compliance_withdrawal" ("id" text not null, "order_id" text not null, "order_display_id" text not null, "customer_id" text null, "email" text not null, "customer_name" text not null, "locale" text null, "status" text check ("status" in ('pending_confirmation', 'confirmed', 'processed', 'rejected', 'expired')) not null default 'pending_confirmation', "whole_order" boolean not null default true, "items" jsonb not null, "statement" text not null, "reason" text null, "confirmation_token_hash" text null, "confirmation_expires_at" timestamptz null, "submitted_at" timestamptz null, "deadline_at" timestamptz null, "within_period" boolean not null default true, "assessment" jsonb null, "acknowledgement_sent_at" timestamptz null, "acknowledgement_error" text null, "handled_by" text null, "handled_at" timestamptz null, "internal_note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_withdrawal_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_withdrawal_deleted_at" ON "consumer_compliance_withdrawal" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_withdrawal_order_id" ON "consumer_compliance_withdrawal" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_withdrawal_status" ON "consumer_compliance_withdrawal" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_withdrawal_customer_id" ON "consumer_compliance_withdrawal" ("customer_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "consumer_compliance_operator" cascade;`);

    this.addSql(`drop table if exists "consumer_compliance_price_history" cascade;`);

    this.addSql(`drop table if exists "consumer_compliance_product" cascade;`);

    this.addSql(`drop table if exists "consumer_compliance_settings" cascade;`);

    this.addSql(`drop table if exists "consumer_compliance_unit_pricing" cascade;`);

    this.addSql(`drop table if exists "consumer_compliance_withdrawal" cascade;`);
  }

}
