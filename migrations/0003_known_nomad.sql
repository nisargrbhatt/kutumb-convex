DROP TABLE `subscription`;--> statement-breakpoint
ALTER TABLE `organization` DROP COLUMN `stripe_customer_id`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `stripe_customer_id`;