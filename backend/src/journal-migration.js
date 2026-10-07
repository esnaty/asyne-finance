export async function migrateJournal(client){
  if((await client.query('SELECT 1 FROM schema_migrations WHERE version=5')).rowCount)return;
  await client.query(`
    CREATE TABLE daily_batches(id uuid PRIMARY KEY,day date NOT NULL UNIQUE,summary text NOT NULL,sources jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE swing_ideas(id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES daily_batches(id),asset_id uuid NOT NULL REFERENCES assets(id),
      entry numeric NOT NULL CHECK(entry>0),stop numeric NOT NULL CHECK(stop>0 AND stop<entry),target numeric NOT NULL CHECK(target>entry),
      rationale text NOT NULL,invalidation text NOT NULL,source_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,sources jsonb NOT NULL,
      decision text NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','skipped')),UNIQUE(batch_id,asset_id));
    CREATE TABLE swing_trades(id uuid PRIMARY KEY,idea_id uuid NOT NULL UNIQUE REFERENCES swing_ideas(id),
      quantity numeric NOT NULL CHECK(quantity>0),price numeric NOT NULL CHECK(price>0),fee numeric NOT NULL CHECK(fee>=0),
      executed_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),request_key uuid NOT NULL UNIQUE);
    CREATE TABLE swing_sales(id uuid PRIMARY KEY,trade_id uuid NOT NULL REFERENCES swing_trades(id),quantity numeric NOT NULL CHECK(quantity>0),
      price numeric NOT NULL CHECK(price>0),fee numeric NOT NULL CHECK(fee>=0),executed_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),request_key uuid NOT NULL UNIQUE);
    CREATE INDEX swing_sales_trade_idx ON swing_sales(trade_id);
    CREATE TABLE daily_reports(id uuid PRIMARY KEY,day date NOT NULL UNIQUE,title text NOT NULL,summary text NOT NULL,observations jsonb NOT NULL,
      suggestions jsonb NOT NULL,sources jsonb NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO schema_migrations(version) VALUES(5);
  `);
}
