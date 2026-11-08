CREATE TABLE `postComment` (
	`id` text PRIMARY KEY NOT NULL,
	`postId` text NOT NULL,
	`authorUserId` text NOT NULL,
	`authorName` text NOT NULL,
	`body` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `postComment_post_created_id_idx` ON `postComment` (`postId`,`createdAt`,`id`);