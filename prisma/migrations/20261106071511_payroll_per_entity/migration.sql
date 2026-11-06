/*
  Warnings:

  - A unique constraint covering the columns `[period,entity]` on the table `payroll_runs` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `payroll_runs_period_key` ON `payroll_runs`;

-- AlterTable
ALTER TABLE `payroll_runs` ADD COLUMN `entity` VARCHAR(2) NOT NULL DEFAULT 'BH';

-- CreateIndex
CREATE UNIQUE INDEX `payroll_runs_period_entity_key` ON `payroll_runs`(`period`, `entity`);
