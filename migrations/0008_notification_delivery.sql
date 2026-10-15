-- Snapshot the rendered message once, so partial Telegram retries remain stable
-- even if business templates are edited while delivery is in progress.
ALTER TABLE outbox ADD COLUMN payload TEXT CHECK(payload IS NULL OR json_valid(payload));
ALTER TABLE outbox ADD COLUMN progress INTEGER NOT NULL DEFAULT 0 CHECK(progress>=0);
CREATE INDEX outbox_order ON outbox(order_id);
