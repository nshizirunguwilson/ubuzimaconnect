-- NFR 9: the audit log can never be edited or deleted, even by someone with direct database access
-- through the app's own user. Adding rows is the only change allowed. (Emptying the whole test
-- database with TRUNCATE is a table-level action and is not blocked; the tests refuse any database
-- whose name doesn't end in _test.)
CREATE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only (NFR 9): % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();
