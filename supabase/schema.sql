-- RK Analyzer V1 schema for an existing Supabase project.
-- All tables use rk_ prefix so they remain isolated from spbu_*.
create extension if not exists pgcrypto;

create table if not exists public.rk_organizations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rk_units (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 organization_id uuid not null references public.rk_organizations(id) on delete cascade, name text not null,
 unit_type text not null check (unit_type in ('SPBU','LPG','SPPBE','OTHER')), code text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rk_bank_accounts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 unit_id uuid not null references public.rk_units(id) on delete cascade, bank_name text not null, account_name text,
 account_number text, account_alias text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rk_import_batches (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 unit_id uuid not null references public.rk_units(id) on delete cascade, bank_account_id uuid references public.rk_bank_accounts(id) on delete set null,
 source_type text not null check (source_type in ('BANK','SETORAN','TEBUSAN')), file_name text, file_hash text, row_count integer not null default 0,
 metadata jsonb not null default '{}'::jsonb, imported_at timestamptz not null default now()
);
create table if not exists public.rk_bank_transactions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 unit_id uuid not null references public.rk_units(id) on delete cascade, bank_account_id uuid references public.rk_bank_accounts(id) on delete set null,
 batch_id uuid references public.rk_import_batches(id) on delete set null, txn_at timestamptz not null, value_date date, description text, reference_no text,
 debit numeric(20,2) not null default 0 check(debit>=0), credit numeric(20,2) not null default 0 check(credit>=0), balance numeric(20,2),
 category text, system_note text, internal_note text, match_status text not null default 'unmatched' check(match_status in ('matched','partial','review','unmatched')),
 confidence integer not null default 0 check(confidence between 0 and 100), match_source text, difference numeric(20,2) not null default 0,
 fingerprint text, raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rk_settlements (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 unit_id uuid not null references public.rk_units(id) on delete cascade, batch_id uuid references public.rk_import_batches(id) on delete set null,
 settlement_at timestamptz not null, settlement_type text, label text, total numeric(20,2) not null check(total>=0), source_ref text, counterparty text,
 raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rk_redemptions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 unit_id uuid not null references public.rk_units(id) on delete cascade, batch_id uuid references public.rk_import_batches(id) on delete set null,
 redemption_at timestamptz not null, product text not null, qty numeric(20,3) not null default 0 check(qty>=0), unit text, unit_price numeric(20,2),
 total numeric(20,2) not null check(total>=0), do_no text, source_ref text, counterparty text, raw_data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rk_classification_rules (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 unit_id uuid references public.rk_units(id) on delete cascade, keyword text, direction text not null default 'ANY' check(direction in ('DEBIT','CREDIT','ANY')),
 min_amount numeric(20,2), max_amount numeric(20,2), category text not null, note_template text, priority integer not null default 100,
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rk_transaction_matches (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 bank_transaction_id uuid not null references public.rk_bank_transactions(id) on delete cascade,
 source_type text not null check(source_type in ('SETORAN','TEBUSAN','RULE','MANUAL','AI')), source_id uuid, match_score numeric(5,2),
 difference numeric(20,2) not null default 0, note text, created_at timestamptz not null default now()
);
create table if not exists public.rk_audit_logs (
 id bigint generated always as identity primary key, owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 entity_type text not null, entity_id uuid, action text not null, old_value jsonb, new_value jsonb, created_at timestamptz not null default now()
);

create index if not exists rk_organizations_owner_idx on public.rk_organizations(owner_id);
create index if not exists rk_units_owner_idx on public.rk_units(owner_id);
create index if not exists rk_units_org_idx on public.rk_units(organization_id);
create index if not exists rk_bank_accounts_owner_idx on public.rk_bank_accounts(owner_id);
create index if not exists rk_bank_accounts_unit_idx on public.rk_bank_accounts(unit_id);
create index if not exists rk_import_batches_owner_idx on public.rk_import_batches(owner_id);
create index if not exists rk_import_batches_account_idx on public.rk_import_batches(bank_account_id);
create index if not exists rk_import_batches_unit_type_idx on public.rk_import_batches(unit_id,source_type,imported_at desc);
create index if not exists rk_bank_transactions_owner_idx on public.rk_bank_transactions(owner_id);
create index if not exists rk_bank_transactions_batch_idx on public.rk_bank_transactions(batch_id);
create index if not exists rk_bank_transactions_unit_date_idx on public.rk_bank_transactions(unit_id,txn_at desc);
create index if not exists rk_bank_transactions_account_date_idx on public.rk_bank_transactions(bank_account_id,txn_at desc);
create index if not exists rk_bank_transactions_status_idx on public.rk_bank_transactions(unit_id,match_status);
create unique index if not exists rk_bank_transactions_fingerprint_uidx on public.rk_bank_transactions(owner_id,unit_id,fingerprint);
create index if not exists rk_settlements_owner_idx on public.rk_settlements(owner_id);
create index if not exists rk_settlements_batch_idx on public.rk_settlements(batch_id);
create index if not exists rk_settlements_unit_date_idx on public.rk_settlements(unit_id,settlement_at desc);
create index if not exists rk_redemptions_owner_idx on public.rk_redemptions(owner_id);
create index if not exists rk_redemptions_batch_idx on public.rk_redemptions(batch_id);
create index if not exists rk_redemptions_unit_date_idx on public.rk_redemptions(unit_id,redemption_at desc);
create index if not exists rk_redemptions_product_idx on public.rk_redemptions(unit_id,product,redemption_at desc);
create index if not exists rk_classification_rules_owner_idx on public.rk_classification_rules(owner_id);
create index if not exists rk_rules_unit_priority_idx on public.rk_classification_rules(unit_id,active,priority);
create index if not exists rk_transaction_matches_owner_idx on public.rk_transaction_matches(owner_id);
create index if not exists rk_matches_tx_idx on public.rk_transaction_matches(bank_transaction_id);
create index if not exists rk_audit_owner_date_idx on public.rk_audit_logs(owner_id,created_at desc);

alter table public.rk_organizations enable row level security;
alter table public.rk_units enable row level security;
alter table public.rk_bank_accounts enable row level security;
alter table public.rk_import_batches enable row level security;
alter table public.rk_bank_transactions enable row level security;
alter table public.rk_settlements enable row level security;
alter table public.rk_redemptions enable row level security;
alter table public.rk_classification_rules enable row level security;
alter table public.rk_transaction_matches enable row level security;
alter table public.rk_audit_logs enable row level security;

do $$ declare t text; begin
 foreach t in array array['rk_organizations','rk_units','rk_bank_accounts','rk_import_batches','rk_bank_transactions','rk_settlements','rk_redemptions','rk_classification_rules','rk_transaction_matches','rk_audit_logs'] loop
  execute format('drop policy if exists rk_owner_select on public.%I',t);
  execute format('drop policy if exists rk_owner_insert on public.%I',t);
  execute format('drop policy if exists rk_owner_update on public.%I',t);
  execute format('drop policy if exists rk_owner_delete on public.%I',t);
  execute format('create policy rk_owner_select on public.%I for select to authenticated using ((select auth.uid())=owner_id)',t);
  execute format('create policy rk_owner_insert on public.%I for insert to authenticated with check ((select auth.uid())=owner_id)',t);
  execute format('create policy rk_owner_update on public.%I for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);
  execute format('create policy rk_owner_delete on public.%I for delete to authenticated using ((select auth.uid())=owner_id)',t);
 end loop;
end $$;

grant select,insert,update,delete on public.rk_organizations,public.rk_units,public.rk_bank_accounts,public.rk_import_batches,public.rk_bank_transactions,public.rk_settlements,public.rk_redemptions,public.rk_classification_rules,public.rk_transaction_matches,public.rk_audit_logs to authenticated;
grant usage,select on sequence public.rk_audit_logs_id_seq to authenticated;
