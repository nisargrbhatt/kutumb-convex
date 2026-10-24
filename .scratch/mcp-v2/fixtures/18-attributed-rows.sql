-- Dev fixture for slice 18: one AI-attributed pending Change Request + one attributed Audit Event.
-- Picks the first member of the first org that has a community profile, and that profile.
-- Apply: npx wrangler d1 execute D1 --local --file .scratch/mcp-v2/fixtures/18-attributed-rows.sql
-- Then check: Reviews (owner/admin), the profile's History tab / Audit log, My requests (as that member).
-- Remove:     DELETE FROM changeRequest WHERE id = 'fixture-18-req';
--             DELETE FROM auditEvent WHERE id = 'fixture-18-evt';
INSERT OR REPLACE INTO changeRequest
	(id, organizationId, profileId, profileName, kind, status, payload,
	 submitterUserId, submitterName, createdAt, viaClientId, viaClientName)
SELECT 'fixture-18-req', p.organizationId, p.id, p.firstName || ' ' || p.lastName, 'info', 'pending',
	'{"nickName":[null,"Fixture"]}', m.user_id, u.name, unixepoch() * 1000, 'fixture-client', 'Claude'
FROM communityProfile p
JOIN member m ON m.organization_id = p.organizationId
JOIN user u ON u.id = m.user_id
LIMIT 1;
--> statement-breakpoint
INSERT OR REPLACE INTO auditEvent
	(id, organizationId, action, createdAt, actorUserId, actorName, actorRole,
	 profileId, profileName, payload, viaClientId, viaClientName)
SELECT 'fixture-18-evt', p.organizationId, 'profile.updated', unixepoch() * 1000, m.user_id, u.name,
	m.role, p.id, p.firstName || ' ' || p.lastName, '{"nickName":[null,"Fixture"]}',
	'fixture-client', 'Claude'
FROM communityProfile p
JOIN member m ON m.organization_id = p.organizationId
JOIN user u ON u.id = m.user_id
LIMIT 1;
