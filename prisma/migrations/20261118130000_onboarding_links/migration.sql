-- CreateTable
CREATE TABLE `onboarding_links` (
    `onboarding_link_id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'sent',
    `created_by_user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `submitted_ip` VARCHAR(45) NULL,
    `answers` JSON NULL,
    `files` JSON NULL,

    UNIQUE INDEX `onboarding_links_token_key`(`token`),
    PRIMARY KEY (`onboarding_link_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
