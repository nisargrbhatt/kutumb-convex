CREATE TABLE `auditEvent` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`action` text NOT NULL,
	`createdAt` integer NOT NULL,
	`actorUserId` text NOT NULL,
	`actorName` text NOT NULL,
	`actorRole` text NOT NULL,
	`profileId` text NOT NULL,
	`profileName` text NOT NULL,
	`counterpartProfileId` text,
	`counterpartName` text,
	`targetId` text,
	`changeRequestId` text,
	`payload` text,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auditEvent_org_created_idx` ON `auditEvent` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `auditEvent_org_profile_created_idx` ON `auditEvent` (`organizationId`,`profileId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `auditEvent_org_counterpart_created_idx` ON `auditEvent` (`organizationId`,`counterpartProfileId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `auditEvent_org_actor_created_idx` ON `auditEvent` (`organizationId`,`actorUserId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `changeRequest` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`profileId` text NOT NULL,
	`profileName` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`targetId` text,
	`payload` text,
	`submitterUserId` text,
	`submitterName` text NOT NULL,
	`createdAt` integer NOT NULL,
	`resolvedByUserId` text,
	`resolvedByName` text,
	`resolvedAt` integer,
	`resolutionNote` text,
	`submitterSeenAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `changeRequest_org_status_created_idx` ON `changeRequest` (`organizationId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `changeRequest_org_submitter_created_idx` ON `changeRequest` (`organizationId`,`submitterUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `changeRequest_profile_status_idx` ON `changeRequest` (`profileId`,`status`);--> statement-breakpoint
ALTER TABLE `communityAddress` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `communityProfile` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-appended backfill: one pending `create` Change Request per existing draft profile.
-- Submitter unknown (null, "Unknown"); no `change_request.submitted` audit event.
INSERT INTO `changeRequest` (`id`, `organizationId`, `profileId`, `profileName`, `kind`, `status`, `payload`, `submitterUserId`, `submitterName`, `createdAt`)
SELECT lower(hex(randomblob(16))), `organizationId`, `id`, trim(`firstName` || ' ' || `lastName`), 'create', 'pending', NULL, NULL, 'Unknown', CAST(unixepoch('subsec') * 1000 AS integer)
FROM `communityProfile` WHERE `status` = 'draft';
