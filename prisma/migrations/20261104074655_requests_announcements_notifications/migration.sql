/*
  Warnings:

  - A unique constraint covering the columns `[contract_number]` on the table `contracts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `contracts` ADD COLUMN `contract_number` VARCHAR(20) NULL,
    ADD COLUMN `job_title` VARCHAR(100) NULL,
    ADD COLUMN `weekly_hours` INTEGER NULL;

-- AlterTable
ALTER TABLE `documents` ADD COLUMN `notes` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(50) NOT NULL,
    `value` VARCHAR(1000) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `notification_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `body` VARCHAR(500) NULL,
    `link` VARCHAR(255) NULL,
    `dedupe_key` VARCHAR(120) NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notifications_dedupe_key_key`(`dedupe_key`),
    INDEX `notifications_user_id_read_at_idx`(`user_id`, `read_at`),
    PRIMARY KEY (`notification_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `request_types` (
    `request_type_id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `category` VARCHAR(10) NOT NULL,
    `template` TEXT NULL,
    `requires_attachment` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `request_types_code_key`(`code`),
    PRIMARY KEY (`request_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_requests` (
    `request_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `type_id` INTEGER NOT NULL,
    `purpose` VARCHAR(255) NOT NULL,
    `details` TEXT NULL,
    `addressed_to` VARCHAR(150) NULL,
    `attachment_id` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `handled_by_user_id` INTEGER NULL,
    `decision_comment` VARCHAR(500) NULL,
    `result_document_id` INTEGER NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `employee_requests_employee_id_status_idx`(`employee_id`, `status`),
    INDEX `employee_requests_status_idx`(`status`),
    PRIMARY KEY (`request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `announcement_id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NOT NULL,
    `body` TEXT NOT NULL,
    `priority` VARCHAR(10) NOT NULL DEFAULT 'normal',
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `audience` VARCHAR(15) NOT NULL DEFAULT 'all',
    `department_ids` JSON NULL,
    `employee_ids` JSON NULL,
    `publish_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `attachment_name` VARCHAR(255) NULL,
    `attachment_stored_name` VARCHAR(100) NULL,
    `attachment_mime` VARCHAR(50) NULL,
    `notified` BOOLEAN NOT NULL DEFAULT false,
    `created_by_user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `announcements_publish_at_idx`(`publish_at`),
    PRIMARY KEY (`announcement_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `contracts_contract_number_key` ON `contracts`(`contract_number`);

-- AddForeignKey
ALTER TABLE `employee_requests` ADD CONSTRAINT `employee_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_requests` ADD CONSTRAINT `employee_requests_type_id_fkey` FOREIGN KEY (`type_id`) REFERENCES `request_types`(`request_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_requests` ADD CONSTRAINT `employee_requests_attachment_id_fkey` FOREIGN KEY (`attachment_id`) REFERENCES `documents`(`document_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_requests` ADD CONSTRAINT `employee_requests_result_document_id_fkey` FOREIGN KEY (`result_document_id`) REFERENCES `documents`(`document_id`) ON DELETE SET NULL ON UPDATE CASCADE;
