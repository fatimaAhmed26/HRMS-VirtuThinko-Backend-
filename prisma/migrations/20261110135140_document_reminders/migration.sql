-- AlterTable
ALTER TABLE `documents` ADD COLUMN `remind_days_before` INTEGER NULL;

-- AlterTable
ALTER TABLE `employees` ADD COLUMN `address_block` VARCHAR(20) NULL,
    ADD COLUMN `address_building` VARCHAR(20) NULL,
    ADD COLUMN `address_city` VARCHAR(100) NULL,
    ADD COLUMN `address_country` VARCHAR(50) NULL,
    ADD COLUMN `address_flat` VARCHAR(20) NULL,
    ADD COLUMN `address_road` VARCHAR(50) NULL,
    ADD COLUMN `alt_phone` VARCHAR(20) NULL,
    ADD COLUMN `bank_account_holder` VARCHAR(150) NULL,
    ADD COLUMN `bank_branch` VARCHAR(100) NULL,
    ADD COLUMN `blood_group` VARCHAR(5) NULL,
    ADD COLUMN `children_count` INTEGER NULL,
    ADD COLUMN `declaration_accepted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `declaration_date` DATE NULL,
    ADD COLUMN `declaration_name` VARCHAR(150) NULL,
    ADD COLUMN `declaration_place` VARCHAR(100) NULL,
    ADD COLUMN `document_checklist` JSON NULL,
    ADD COLUMN `driving_licence_number` VARCHAR(30) NULL,
    ADD COLUMN `emergency2_address` VARCHAR(255) NULL,
    ADD COLUMN `emergency2_alt_phone` VARCHAR(20) NULL,
    ADD COLUMN `emergency2_name` VARCHAR(100) NULL,
    ADD COLUMN `emergency2_phone` VARCHAR(20) NULL,
    ADD COLUMN `emergency2_relationship` VARCHAR(50) NULL,
    ADD COLUMN `emergency_address` VARCHAR(255) NULL,
    ADD COLUMN `emergency_alt_phone` VARCHAR(20) NULL,
    ADD COLUMN `emergency_relationship` VARCHAR(50) NULL,
    ADD COLUMN `full_name_arabic` VARCHAR(150) NULL,
    ADD COLUMN `full_name_id` VARCHAR(150) NULL,
    ADD COLUMN `full_name_passport` VARCHAR(150) NULL,
    ADD COLUMN `has_medical_condition` BOOLEAN NULL,
    ADD COLUMN `has_restrictive_clauses` BOOLEAN NULL,
    ADD COLUMN `home_country_address` VARCHAR(255) NULL,
    ADD COLUMN `hr_remarks` VARCHAR(500) NULL,
    ADD COLUMN `id_expiry` DATE NULL,
    ADD COLUMN `languages` VARCHAR(255) NULL,
    ADD COLUMN `marital_status` VARCHAR(15) NULL,
    ADD COLUMN `may_contact_employers` BOOLEAN NULL,
    ADD COLUMN `medical_details` TEXT NULL,
    ADD COLUMN `other_nationality` VARCHAR(50) NULL,
    ADD COLUMN `passport_expiry` DATE NULL,
    ADD COLUMN `passport_issue_date` DATE NULL,
    ADD COLUMN `passport_number` VARCHAR(30) NULL,
    ADD COLUMN `passport_place_of_issue` VARCHAR(100) NULL,
    ADD COLUMN `permit_expiry` DATE NULL,
    ADD COLUMN `permit_number` VARCHAR(30) NULL,
    ADD COLUMN `personal_email` VARCHAR(100) NULL,
    ADD COLUMN `place_of_birth` VARCHAR(100) NULL,
    ADD COLUMN `regular_medication` TEXT NULL,
    ADD COLUMN `social_insurance_number` VARCHAR(30) NULL,
    ADD COLUMN `verified_at` DATE NULL,
    ADD COLUMN `verified_by_user_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `dependants` (
    `dependant_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `full_name` VARCHAR(150) NOT NULL,
    `relationship` VARCHAR(20) NOT NULL,
    `birth_date` DATE NULL,
    `nationality` VARCHAR(50) NULL,
    `id_number` VARCHAR(30) NULL,

    INDEX `dependants_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`dependant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qualifications` (
    `qualification_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `kind` VARCHAR(15) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `institution` VARCHAR(150) NULL,
    `country` VARCHAR(50) NULL,
    `year` INTEGER NULL,
    `grade` VARCHAR(20) NULL,
    `obtained_date` DATE NULL,
    `expiry_date` DATE NULL,

    INDEX `qualifications_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`qualification_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `previous_employments` (
    `previous_employment_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `employer_name` VARCHAR(150) NOT NULL,
    `job_title` VARCHAR(100) NULL,
    `from_date` DATE NULL,
    `to_date` DATE NULL,
    `reason_for_leaving` VARCHAR(255) NULL,
    `ref_name` VARCHAR(100) NULL,
    `ref_job_title` VARCHAR(100) NULL,
    `ref_phone` VARCHAR(20) NULL,
    `ref_email` VARCHAR(100) NULL,

    INDEX `previous_employments_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`previous_employment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dependants` ADD CONSTRAINT `dependants_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qualifications` ADD CONSTRAINT `qualifications_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `previous_employments` ADD CONSTRAINT `previous_employments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;
