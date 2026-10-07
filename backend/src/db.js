import { migrateJournal } from './journal-migration.js';
import pg from 'pg';

export const pool=new pg.Pool({max:10,connectionTimeoutMillis:5000});

export async function migrate(){const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(741905)");await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);const applied=await client.query('SELECT version FROM schema_migrations WHERE version=1');if(!applied.rowCount){await client.query(`CREATE TABLE positions(id uuid PRIMARY KEY, symbol varchar(20) NOT NULL, quantity numeric NOT NULL CHECK(quantity>0), average_price numeric NOT NULL CHECK(average_price>0), current_price numeric CHECK(current_price>=0), currency varchar(4) NOT NULL CHECK(currency IN ('USD','EUR','USDT')), strategy varchar(12) NOT NULL CHECK(strategy IN ('long_term','swing')), updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE plans(id uuid PRIMARY KEY, symbol varchar(20) NOT NULL, market varchar(80) NOT NULL, currency varchar(4) NOT NULL CHECK(currency IN ('USD','EUR','USDT')), entry numeric NOT NULL CHECK(entry>0), stop numeric NOT NULL CHECK(stop>0 AND stop<entry), target numeric NOT NULL CHECK(target>entry), notes text NOT NULL DEFAULT '', expires_at timestamptz, status varchar(12) NOT NULL CHECK(status IN ('draft','watching','invalidated','archived')), updated_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(version) VALUES(1);`);}const second=await client.query('SELECT version FROM schema_migrations WHERE version=2');

if(!second.rowCount){await client.query(`

ALTER TABLE positions ADD COLUMN amount numeric CHECK(amount>0),

ADD COLUMN target_price numeric CHECK(target_price>average_price),

ADD COLUMN stop_loss numeric CHECK(stop_loss>0 AND stop_loss<average_price);

INSERT INTO schema_migrations(version) VALUES(2);

`);}const third=await client.query('SELECT version FROM schema_migrations WHERE version=3');

if(!third.rowCount){await client.query(`

CREATE TABLE assets(

 id uuid PRIMARY KEY, symbol varchar(20) NOT NULL, name text NOT NULL,

 kind text NOT NULL CHECK(kind IN ('crypto','stock','etf')),

 currency varchar(4) NOT NULL CHECK(currency IN ('USD','EUR','USDT')),

 exchange text NOT NULL, provider text NOT NULL CHECK(provider IN ('binance','twelve')),

 provider_symbol text NOT NULL, mic text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,

 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,provider_symbol,mic,exchange,currency)

);

CREATE INDEX assets_symbol_idx ON assets(symbol);

CREATE TABLE asset_quotes(asset_id uuid PRIMARY KEY REFERENCES assets(id),price numeric NOT NULL CHECK(price>0),as_of timestamptz NOT NULL,received_at timestamptz NOT NULL,source text NOT NULL,status text NOT NULL,message text NOT NULL);

ALTER TABLE positions ADD COLUMN asset_id uuid REFERENCES assets(id);

INSERT INTO schema_migrations(version) VALUES(3);

`);}const fourth=await client.query('SELECT version FROM schema_migrations WHERE version=4');

if(!fourth.rowCount){await client.query(`

ALTER TABLE positions ADD COLUMN exits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(exits)='array'),

ADD COLUMN import_source jsonb,

ADD COLUMN import_key text UNIQUE;

INSERT INTO schema_migrations(version) VALUES(4);

`);}await migrateJournal(client);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}





