import { Migration } from '@mikro-orm/migrations';

export class MigrationInboxOutbox1733350000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE INDEX idx_inbox_outbox_expire_at
      ON inbox_outbox_transport_event (expire_at);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP INDEX IF EXISTS idx_inbox_outbox_expire_at;');
  }
}
