CREATE TABLE `communityAddress` (
	`id` text PRIMARY KEY NOT NULL,
	`line1` text NOT NULL,
	`line2` text,
	`country` text NOT NULL,
	`state` text NOT NULL,
	`city` text NOT NULL,
	`postalCode` text NOT NULL,
	`type` text,
	`note` text,
	`digipin` text,
	`communityProfileId` text,
	FOREIGN KEY (`communityProfileId`) REFERENCES `communityProfile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `communityMemory` (
	`id` text PRIMARY KEY NOT NULL,
	`createdBy` text,
	`organizationId` text,
	`content` text NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `communityProfile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `communityProfile` (
	`id` text PRIMARY KEY NOT NULL,
	`firstName` text NOT NULL,
	`middleName` text,
	`lastName` text NOT NULL,
	`nickName` text,
	`gender` text,
	`email` text,
	`status` text NOT NULL,
	`bloodGroup` text,
	`mobileNumber` text,
	`dateOfBirth` text,
	`dateOfDeath` text,
	`gotra` text,
	`native` text,
	`maternal` text,
	`birthPlace` text,
	`relationship` text,
	`comment` text,
	`profileId` text,
	`organizationId` text NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `communityRelation` (
	`id` text PRIMARY KEY NOT NULL,
	`fromId` text,
	`toId` text,
	`organizationId` text,
	`type` text,
	`note` text,
	`bloodRelation` integer DEFAULT false,
	FOREIGN KEY (`fromId`) REFERENCES `communityProfile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`toId`) REFERENCES `communityProfile`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `organizationMember` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`memberId` text,
	`role` text DEFAULT 'member' NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`memberId`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`displayName` text NOT NULL,
	`email` text NOT NULL,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
