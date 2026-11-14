-- AlterTable
ALTER TABLE `employees` ADD COLUMN `academic_tutor` VARCHAR(100) NULL,
    ADD COLUMN `internship_end` DATE NULL,
    ADD COLUMN `internship_start` DATE NULL,
    ADD COLUMN `letter_signed_at` DATE NULL,
    ADD COLUMN `major` VARCHAR(100) NULL,
    ADD COLUMN `project_summary` TEXT NULL,
    ADD COLUMN `project_title` VARCHAR(200) NULL,
    ADD COLUMN `skills` VARCHAR(255) NULL,
    ADD COLUMN `student_id` VARCHAR(30) NULL,
    ADD COLUMN `university` VARCHAR(150) NULL;
