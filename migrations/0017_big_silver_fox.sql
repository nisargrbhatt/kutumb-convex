CREATE TABLE `postMemoryMedia` (
	`postId` text NOT NULL,
	`blobId` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`postId`, `position`),
	FOREIGN KEY (`postId`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `postMemoryMedia_blob_uidx` ON `postMemoryMedia` (`blobId`);