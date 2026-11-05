-- AlterTable
ALTER TABLE `employees` ADD COLUMN `client_company_id` INTEGER NULL,
    ADD COLUMN `client_supervisor` VARCHAR(150) NULL,
    ADD COLUMN `deployment_end` DATE NULL,
    ADD COLUMN `deployment_start` DATE NULL,
    ADD COLUMN `po_number` VARCHAR(50) NULL;

-- AlterTable
ALTER TABLE `leave_types` ADD COLUMN `notice_days` INTEGER NULL,
    ADD COLUMN `notice_free_days` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `client_companies` (
    `client_company_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `name_ar` VARCHAR(150) NULL,
    `annual_leave_days` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `client_companies_name_key`(`name`),
    PRIMARY KEY (`client_company_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_client_company_id_fkey` FOREIGN KEY (`client_company_id`) REFERENCES `client_companies`(`client_company_id`) ON DELETE SET NULL ON UPDATE CASCADE;
