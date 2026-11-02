/*
  Warnings:

  - You are about to drop the column `attachment_url` on the `leave_requests` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `leave_requests` DROP COLUMN `attachment_url`,
    ADD COLUMN `attachment_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `documents` (
    `document_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `category` VARCHAR(30) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_name` VARCHAR(100) NOT NULL,
    `mime_type` VARCHAR(50) NOT NULL,
    `size` INTEGER NOT NULL,
    `expiry_date` DATE NULL,
    `visible_to_employee` BOOLEAN NOT NULL DEFAULT true,
    `uploaded_by_user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `documents_stored_name_key`(`stored_name`),
    INDEX `documents_employee_id_category_idx`(`employee_id`, `category`),
    INDEX `documents_expiry_date_idx`(`expiry_date`),
    PRIMARY KEY (`document_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_attachment_id_fkey` FOREIGN KEY (`attachment_id`) REFERENCES `documents`(`document_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
