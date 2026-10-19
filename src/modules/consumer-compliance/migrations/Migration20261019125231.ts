import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261019125231 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "consumer_compliance_order_consent" drop constraint if exists "consumer_compliance_order_consent_order_id_key_unique";`);
    this.addSql(`alter table if exists "consumer_compliance_consent_version" drop constraint if exists "consumer_compliance_consent_version_consent_id_version_unique";`);
    this.addSql(`alter table if exists "consumer_compliance_consent" drop constraint if exists "consumer_compliance_consent_key_unique";`);
    this.addSql(`create table if not exists "consumer_compliance_consent" ("id" text not null, "key" text not null, "label" jsonb not null, "link_url" text null, "link_label" jsonb null, "link_sha256" text null, "version" integer not null default 1, "required" boolean not null default true, "active" boolean not null default true, "purpose" text check ("purpose" in ('generic', 'digital_content_withdrawal_waiver')) not null default 'generic', "rules" jsonb not null, "position" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_consent_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_consent_deleted_at" ON "consumer_compliance_consent" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consumer_compliance_consent_key_unique" ON "consumer_compliance_consent" ("key") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "consumer_compliance_consent_acceptance" ("id" text not null, "cart_id" text not null, "order_id" text null, "consent_id" text not null, "key" text not null, "version" integer not null, "purpose" text not null, "text" text not null, "locale" text null, "link_url" text null, "link_sha256" text null, "required" boolean not null default true, "covered_product_ids" text[] null, "accepted_at" timestamptz not null, "ip" text null, "user_agent" text null, "customer_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_consent_acceptance_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_consent_acceptance_deleted_at" ON "consumer_compliance_consent_acceptance" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_consent_acceptance_cart_id" ON "consumer_compliance_consent_acceptance" ("cart_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_consent_acceptance_order_id" ON "consumer_compliance_consent_acceptance" ("order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "consumer_compliance_consent_version" ("id" text not null, "consent_id" text not null, "key" text not null, "version" integer not null, "label" jsonb not null, "link_url" text null, "link_label" jsonb null, "link_sha256" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_consent_version_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_consent_version_deleted_at" ON "consumer_compliance_consent_version" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consumer_compliance_consent_version_consent_id_version_unique" ON "consumer_compliance_consent_version" ("consent_id", "version") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "consumer_compliance_order_consent" ("id" text not null, "order_id" text not null, "cart_id" text null, "acceptance_id" text null, "consent_id" text null, "key" text not null, "purpose" text not null, "version" integer not null, "required" boolean not null, "text" text not null, "locale" text null, "link_url" text null, "link_sha256" text null, "covered_product_ids" text[] null, "accepted_at" timestamptz not null, "ip" text null, "user_agent" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "consumer_compliance_order_consent_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_order_consent_deleted_at" ON "consumer_compliance_order_consent" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_consumer_compliance_order_consent_order_id_key_unique" ON "consumer_compliance_order_consent" ("order_id", "key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_consumer_compliance_order_consent_accepted_at" ON "consumer_compliance_order_consent" ("accepted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "consumer_compliance_settings" add column if not exists "consents_seeded" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "consumer_compliance_consent" cascade;`);

    this.addSql(`drop table if exists "consumer_compliance_consent_acceptance" cascade;`);

    this.addSql(`drop table if exists "consumer_compliance_consent_version" cascade;`);

    this.addSql(`drop table if exists "consumer_compliance_order_consent" cascade;`);

    this.addSql(`alter table if exists "consumer_compliance_settings" drop column if exists "consents_seeded";`);
  }

}
