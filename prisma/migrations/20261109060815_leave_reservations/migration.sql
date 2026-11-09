-- CreateTable
CREATE TABLE `leave_reservations` (
    `leave_reservation_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `leave_type_id` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `note` VARCHAR(255) NULL,
    `reminded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `leave_reservations_start_date_end_date_idx`(`start_date`, `end_date`),
    INDEX `leave_reservations_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`leave_reservation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `leave_reservations` ADD CONSTRAINT `leave_reservations_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_reservations` ADD CONSTRAINT `leave_reservations_leave_type_id_fkey` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`leave_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
