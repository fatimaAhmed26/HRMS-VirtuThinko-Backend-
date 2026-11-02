-- AlterTable
ALTER TABLE `employees` ADD COLUMN `is_national` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `si_new_scheme` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `contracts` (
    `contract_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `contract_type` VARCHAR(20) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `basic_salary` DECIMAL(12, 3) NOT NULL,
    `housing_allowance` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `transport_allowance` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `document_id` INTEGER NULL,
    `notes` VARCHAR(500) NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contracts_employee_id_status_idx`(`employee_id`, `status`),
    INDEX `contracts_end_date_idx`(`end_date`),
    PRIMARY KEY (`contract_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_item_types` (
    `pay_item_type_id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `contributory` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `pay_item_types_code_key`(`code`),
    PRIMARY KEY (`pay_item_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_items` (
    `pay_item_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `type_id` INTEGER NOT NULL,
    `amount` DECIMAL(12, 3) NOT NULL,
    `recurring` BOOLEAN NOT NULL DEFAULT false,
    `from_period` VARCHAR(7) NOT NULL,
    `to_period` VARCHAR(7) NULL,
    `reason` VARCHAR(255) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `created_by_user_id` INTEGER NOT NULL,
    `approved_by_user_id` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pay_items_employee_id_status_idx`(`employee_id`, `status`),
    PRIMARY KEY (`pay_item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_runs` (
    `payroll_run_id` INTEGER NOT NULL AUTO_INCREMENT,
    `period` VARCHAR(7) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `warnings` JSON NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `approved_by_user_id` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `processed_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payroll_runs_period_key`(`period`),
    PRIMARY KEY (`payroll_run_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payslips` (
    `payslip_id` INTEGER NOT NULL AUTO_INCREMENT,
    `payroll_run_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `contract_id` INTEGER NOT NULL,
    `employee_code` VARCHAR(20) NOT NULL,
    `employee_name` VARCHAR(110) NOT NULL,
    `department` VARCHAR(100) NULL,
    `job_title` VARCHAR(100) NULL,
    `country` VARCHAR(2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `basic_salary` DECIMAL(12, 3) NOT NULL,
    `earnings` JSON NOT NULL,
    `deductions` JSON NOT NULL,
    `employer_contributions` JSON NOT NULL,
    `gross_salary` DECIMAL(12, 3) NOT NULL,
    `total_deductions` DECIMAL(12, 3) NOT NULL,
    `net_salary` DECIMAL(12, 3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payslips_payroll_run_id_employee_id_key`(`payroll_run_id`, `employee_id`),
    PRIMARY KEY (`payslip_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`document_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_items` ADD CONSTRAINT `pay_items_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_items` ADD CONSTRAINT `pay_items_type_id_fkey` FOREIGN KEY (`type_id`) REFERENCES `pay_item_types`(`pay_item_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payslips` ADD CONSTRAINT `payslips_payroll_run_id_fkey` FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs`(`payroll_run_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payslips` ADD CONSTRAINT `payslips_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payslips` ADD CONSTRAINT `payslips_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`contract_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
