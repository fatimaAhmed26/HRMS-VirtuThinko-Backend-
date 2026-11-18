-- English contract title, contract terms (employing entity, probation, notice, leave, salary items)
-- and the link to the signature request sent to the employee
ALTER TABLE `contracts`
    ADD COLUMN `title` VARCHAR(150) NULL,
    ADD COLUMN `terms` JSON NULL,
    ADD COLUMN `signature_request_id` INTEGER NULL;

CREATE UNIQUE INDEX `contracts_signature_request_id_key` ON `contracts`(`signature_request_id`);

ALTER TABLE `contracts` ADD CONSTRAINT `contracts_signature_request_id_fkey`
    FOREIGN KEY (`signature_request_id`) REFERENCES `signature_requests`(`signature_request_id`) ON DELETE SET NULL ON UPDATE CASCADE;
