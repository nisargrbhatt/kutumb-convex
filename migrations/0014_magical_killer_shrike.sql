CREATE TABLE `postLike` (
	`id` text PRIMARY KEY NOT NULL,
	`postId` text NOT NULL,
	`userId` text NOT NULL,
	`userName` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `postLike_post_user_uidx` ON `postLike` (`postId`,`userId`);--> statement-breakpoint
CREATE INDEX `postLike_post_created_id_idx` ON `postLike` (`postId`,`createdAt`,`id`);