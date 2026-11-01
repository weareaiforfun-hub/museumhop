CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`route` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`member_id` text NOT NULL,
	`event_id` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_unique` ON `suggestions` (`plan_id`,`member_id`,`event_id`);