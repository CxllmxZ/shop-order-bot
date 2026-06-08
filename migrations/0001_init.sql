CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_user_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  product TEXT,
  quantity INTEGER,
  total_price REAL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE TABLE admins (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  registered_at INTEGER
);

CREATE TABLE sessions (
  user_id TEXT PRIMARY KEY,
  step TEXT,
  data TEXT,
  updated_at INTEGER
);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT
);