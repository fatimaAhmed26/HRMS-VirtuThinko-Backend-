-- AlterTable
ALTER TABLE `employees` ADD COLUMN `is_clp` BOOLEAN NOT NULL DEFAULT false;

-- CLP was an intern type; it is now a yes/no flag. Keep those interns as students.
UPDATE `employees` SET `is_clp` = true, `intern_type` = 'student' WHERE `intern_type` = 'clp';
