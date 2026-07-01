PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_minus_one_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guard_id` integer NOT NULL,
	`requested_by` integer NOT NULL,
	`kind` text DEFAULT 'MINUS_ONE' NOT NULL,
	`reason` text,
	`note` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`rejection_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	`decided_by` integer,
	`returned_at` text
);
--> statement-breakpoint
INSERT INTO `__new_minus_one_requests`("id", "guard_id", "requested_by", "kind", "reason", "note", "status", "rejection_reason", "created_at", "decided_at", "decided_by", "returned_at") SELECT "id", "guard_id", "requested_by", 'MINUS_ONE', "reason", "note", "status", "rejection_reason", "created_at", "decided_at", "decided_by", "returned_at" FROM `minus_one_requests`;--> statement-breakpoint
DROP TABLE `minus_one_requests`;--> statement-breakpoint
ALTER TABLE `__new_minus_one_requests` RENAME TO `minus_one_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_req_status` ON `minus_one_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_req_guard` ON `minus_one_requests` (`guard_id`);