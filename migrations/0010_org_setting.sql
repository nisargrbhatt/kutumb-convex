CREATE TABLE `orgSetting` (
	`organizationId` text PRIMARY KEY NOT NULL,
	`aiClientWrites` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
