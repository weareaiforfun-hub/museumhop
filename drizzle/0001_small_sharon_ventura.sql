CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`practical` text NOT NULL,
	`route` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_member_unique` ON `proposals` (`plan_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `members` ADD `fictional` integer DEFAULT 0 NOT NULL;