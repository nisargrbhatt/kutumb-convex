CREATE TABLE `billingNotice` (
	`organizationId` text NOT NULL,
	`kind` text NOT NULL,
	`anchor` text NOT NULL,
	`sentAt` integer NOT NULL,
	PRIMARY KEY(`organizationId`, `kind`, `anchor`),
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `billingWebhookEvent` (
	`webhookId` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`receivedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orgBilling` (
	`organizationId` text PRIMARY KEY NOT NULL,
	`createdByUserId` text NOT NULL,
	`country` text NOT NULL,
	`dodoCustomerId` text,
	`subscriptionId` text,
	`status` text,
	`trialEndsAt` integer NOT NULL,
	`nextBillingDate` integer,
	`cancelAtNextBillingDate` integer DEFAULT false NOT NULL,
	`pastDueEndsAt` integer,
	`hasPaymentMethod` integer DEFAULT false NOT NULL,
	`recurringPreTaxAmount` integer,
	`needsSubscription` integer DEFAULT true NOT NULL,
	`syncedAt` integer NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
