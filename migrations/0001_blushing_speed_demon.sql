CREATE INDEX `communityProfile_org_status_idx` ON `communityProfile` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `communityRelation_org_from_idx` ON `communityRelation` (`organizationId`,`fromId`);--> statement-breakpoint
CREATE INDEX `communityRelation_org_to_idx` ON `communityRelation` (`organizationId`,`toId`);