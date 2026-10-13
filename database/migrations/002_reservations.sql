CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
CREATE TABLE reservations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  purpose text NOT NULL CHECK(char_length(purpose) BETWEEN 3 AND 120),
  status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,resource_id) REFERENCES resources(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,actor_id) REFERENCES users(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  CHECK(ends_at-starts_at BETWEEN interval '15 minutes' AND interval '4 hours'),
  CONSTRAINT no_overlapping_reservations EXCLUDE USING gist (
    workspace_id WITH =,resource_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&
  ) WHERE(status='confirmed')
);
CREATE INDEX reservation_schedule ON reservations(workspace_id,resource_id,starts_at);
CREATE TABLE reservation_commands (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key uuid NOT NULL,
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  reservation_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,key),
  FOREIGN KEY(workspace_id,reservation_id) REFERENCES reservations(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE reservation_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('created','rescheduled','cancelled')),
  reason text,
  before_snapshot jsonb,
  after_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(workspace_id,reservation_id) REFERENCES reservations(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,actor_id) REFERENCES users(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  CHECK(reason IS NULL OR char_length(reason) BETWEEN 3 AND 500)
);
CREATE INDEX reservation_history ON reservation_events(workspace_id,reservation_id,created_at,id);
CREATE FUNCTION protect_reservation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM workspaces WHERE id=OLD.workspace_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Reservation events are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_reservation_history BEFORE UPDATE OR DELETE ON reservation_events FOR EACH ROW EXECUTE FUNCTION protect_reservation_history();
