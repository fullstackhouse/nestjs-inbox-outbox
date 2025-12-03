import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

export class MigrationInboxOutbox1733350000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'inbox_outbox_transport_event',
      new TableIndex({
        name: 'idx_inbox_outbox_expire_at',
        columnNames: ['expire_at'],
      })
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('inbox_outbox_transport_event', 'idx_inbox_outbox_expire_at');
  }
}
