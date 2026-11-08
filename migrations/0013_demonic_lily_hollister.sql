CREATE TABLE `blob` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`mediaKind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ownerKind` text,
	`ownerId` text,
	`uploadedByUserId` text NOT NULL,
	`size` integer NOT NULL,
	`variants` text DEFAULT '{}' NOT NULL,
	`width` integer,
	`height` integer,
	`durationMs` integer,
	`contentType` text,
	`sha256` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blob_org_status_idx` ON `blob` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `blob_org_uploader_status_idx` ON `blob` (`organizationId`,`uploadedByUserId`,`status`);--> statement-breakpoint
CREATE INDEX `blob_status_created_idx` ON `blob` (`status`,`createdAt`);