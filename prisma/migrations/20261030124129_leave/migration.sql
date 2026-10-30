-- AlterTable
ALTER TABLE `employees` ADD COLUMN `country` VARCHAR(2) NOT NULL DEFAULT 'BH';

-- CreateTable
CREATE TABLE `leave_types` (
    `leave_type_id` INTEGER NOT NULL AUTO_INCREMENT,
    `country` VARCHAR(2) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `allowance` VARCHAR(10) NOT NULL,
    `days` INTEGER NOT NULL,
    `days_after_years` INTEGER NULL,
    `days_after` INTEGER NULL,
    `accrue_first_year` BOOLEAN NOT NULL DEFAULT false,
    `pay_tiers` JSON NULL,
    `min_service_months` INTEGER NOT NULL DEFAULT 0,
    `gender` VARCHAR(10) NULL,
    `once_per_employment` BOOLEAN NOT NULL DEFAULT false,
    `requires_attachment` BOOLEAN NOT NULL DEFAULT false,
    `count_working_days` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `leave_types_country_code_key`(`country`, `code`),
    PRIMARY KEY (`leave_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_requests` (
    `leave_request_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `leave_type_id` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `days` INTEGER NOT NULL,
    `reason` VARCHAR(500) NULL,
    `attachment_url` VARCHAR(255) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending_manager',
    `pay_breakdown` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `leave_requests_employee_id_status_idx`(`employee_id`, `status`),
    INDEX `leave_requests_status_idx`(`status`),
    PRIMARY KEY (`leave_request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_approvals` (
    `leave_approval_id` INTEGER NOT NULL AUTO_INCREMENT,
    `leave_request_id` INTEGER NOT NULL,
    `stage` VARCHAR(20) NOT NULL,
    `decision` VARCHAR(20) NOT NULL,
    `comment` VARCHAR(500) NULL,
    `approver_user_id` INTEGER NOT NULL,
    `approver_name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`leave_approval_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `public_holidays` (
    `holiday_id` INTEGER NOT NULL AUTO_INCREMENT,
    `country` VARCHAR(2) NOT NULL,
    `date` DATE NOT NULL,
    `name` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `public_holidays_country_date_key`(`country`, `date`),
    PRIMARY KEY (`holiday_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_leave_type_id_fkey` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`leave_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_approvals` ADD CONSTRAINT `leave_approvals_leave_request_id_fkey` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`leave_request_id`) ON DELETE CASCADE ON UPDATE CASCADE;
