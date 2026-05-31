import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
CREATE TABLE IF NOT EXISTS folders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  refresh_url TEXT,
  url_expires_at TIMESTAMPTZ,
  url_refreshed_at TIMESTAMPTZ,
  fallback_url TEXT,
  mirror_urls TEXT[] NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'selfhosted',
  status TEXT NOT NULL DEFAULT 'unknown',
  mime_type TEXT,
  content_length BIGINT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_logs (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  bytes BIGINT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  detail TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

try {
  await client.connect();
  console.log("Conectado ao banco!");
  await client.query(SQL);
  console.log("Tabelas criadas com sucesso!");
  await client.end();
} catch (err) {
  console.error("Erro:", err.message);
  process.exit(1);
}
