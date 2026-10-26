CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor` text NOT NULL,
	`name` text NOT NULL,
	`device` text NOT NULL,
	`day` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_day` ON `events` (`day`,`name`);--> statement-breakpoint
CREATE TABLE `interests` (
	`email` text PRIMARY KEY NOT NULL,
	`visitor` text NOT NULL,
	`plan` text NOT NULL,
	`price` integer NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`book_id` text,
	`data` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`owner`, `kind`, `id`)
);
--> statement-breakpoint
CREATE INDEX `records_book` ON `records` (`owner`,`book_id`);