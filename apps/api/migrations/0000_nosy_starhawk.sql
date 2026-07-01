CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` integer,
	`details` text,
	`ip_address` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_ts` ON `audit_log` (`timestamp`);--> statement-breakpoint
CREATE TABLE `boat_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`call_sign` text,
	`status` text DEFAULT 'AT_TOWER' NOT NULL,
	`latitude` real,
	`longitude` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `boats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`call_sign` text,
	`tower_id` integer,
	`status` text DEFAULT 'AT_TOWER' NOT NULL,
	`latitude` real,
	`longitude` real,
	`owner_id` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_boats_owner` ON `boats` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_boats_tower` ON `boats` (`tower_id`);--> statement-breakpoint
CREATE TABLE `guards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`tower_id` integer,
	`name` text NOT NULL,
	`status` text DEFAULT 'IN_AREA' NOT NULL,
	`latitude` real,
	`longitude` real,
	`owner_id` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_guards_owner` ON `guards` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_guards_tower` ON `guards` (`tower_id`);--> statement-breakpoint
CREATE TABLE `minus_one_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guard_id` integer NOT NULL,
	`requested_by` integer NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`rejection_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	`decided_by` integer,
	`returned_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_req_status` ON `minus_one_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_req_guard` ON `minus_one_requests` (`guard_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`sid` text PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expire` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tower_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`call_sign` text,
	`latitude` real,
	`longitude` real,
	`required_staff` integer DEFAULT 2 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `towers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`call_sign` text,
	`latitude` real,
	`longitude` real,
	`required_staff` integer DEFAULT 2 NOT NULL,
	`present_staff` integer DEFAULT 0 NOT NULL,
	`owner_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_towers_owner` ON `towers` (`owner_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text,
	`role` text DEFAULT 'WACHGAENGER' NOT NULL,
	`tower_id` integer,
	`owner_id` integer,
	`is_admin` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_owner` ON `users` (`owner_id`);