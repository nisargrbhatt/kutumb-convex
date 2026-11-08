CREATE TABLE `post` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`kind` text NOT NULL,
	`authorUserId` text NOT NULL,
	`authorName` text NOT NULL,
	`createdAt` integer NOT NULL,
	`editedAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_org_created_id_idx` ON `post` (`organizationId`,`createdAt`,`id`);--> statement-breakpoint
CREATE TABLE `postMemory` (
	`postId` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`descriptionDoc` text,
	`descriptionText` text,
	FOREIGN KEY (`postId`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade
);
