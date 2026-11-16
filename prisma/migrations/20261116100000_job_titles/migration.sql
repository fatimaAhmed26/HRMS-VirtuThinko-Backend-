-- CreateTable
CREATE TABLE `job_titles` (
    `job_title_id` INTEGER NOT NULL AUTO_INCREMENT,
    `department_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `grade` VARCHAR(20) NULL,
    `country` VARCHAR(2) NOT NULL,
    `min_salary` DECIMAL(12, 3) NULL,
    `max_salary` DECIMAL(12, 3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `job_titles_department_id_name_country_key`(`department_id`, `name`, `country`),
    PRIMARY KEY (`job_title_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_titles` ADD CONSTRAINT `job_titles_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`department_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
