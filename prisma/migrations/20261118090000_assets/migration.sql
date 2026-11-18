-- CreateTable
CREATE TABLE `assets` (
    `asset_id` INTEGER NOT NULL AUTO_INCREMENT,
    `tag` VARCHAR(20) NOT NULL,
    `category` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `serial` VARCHAR(100) NULL,
    `item_condition` VARCHAR(20) NOT NULL DEFAULT 'good',
    `country` VARCHAR(2) NOT NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_tag_key`(`tag`),
    INDEX `assets_country_idx`(`country`),
    PRIMARY KEY (`asset_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_assignments` (
    `asset_assignment_id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `assigned_by_user_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `returned_at` DATETIME(3) NULL,
    `return_condition` VARCHAR(20) NULL,

    INDEX `asset_assignments_employee_id_returned_at_idx`(`employee_id`, `returned_at`),
    INDEX `asset_assignments_asset_id_returned_at_idx`(`asset_id`, `returned_at`),
    PRIMARY KEY (`asset_assignment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_assignments` ADD CONSTRAINT `asset_assignments_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`asset_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_assignments` ADD CONSTRAINT `asset_assignments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
