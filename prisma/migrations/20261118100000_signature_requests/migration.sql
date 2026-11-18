-- CreateTable
CREATE TABLE `signature_requests` (
    `signature_request_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `kind` VARCHAR(30) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'sent',
    `document_stored_name` VARCHAR(100) NOT NULL,
    `document_name` VARCHAR(255) NOT NULL,
    `document_sha256` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `signed_at` DATETIME(3) NULL,
    `signer_name` VARCHAR(150) NULL,
    `signer_ip` VARCHAR(45) NULL,
    `signature_stored_name` VARCHAR(100) NULL,

    UNIQUE INDEX `signature_requests_token_key`(`token`),
    INDEX `signature_requests_employee_id_status_idx`(`employee_id`, `status`),
    PRIMARY KEY (`signature_request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `signature_requests` ADD CONSTRAINT `signature_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
