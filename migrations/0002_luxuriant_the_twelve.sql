PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organizationMember` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`memberId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`memberId`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_organizationMember`("id", "organizationId", "memberId", "role") SELECT "id", "organizationId", "memberId", "role" FROM `organizationMember`;--> statement-breakpoint
DROP TABLE `organizationMember`;--> statement-breakpoint
ALTER TABLE `__new_organizationMember` RENAME TO `organizationMember`;--> statement-breakpoint
PRAGMA foreign_keys=ON;