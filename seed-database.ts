import { DataSource } from 'typeorm';
import { seedMerchantsAndMenus } from './src/merchants/merchants.seed';

/**
 * Standalone script to seed the database directly
 * Run with: npx ts-node seed-database.ts
 */
async function main() {
  console.log('🌱 Starting database seeding...');
  console.log('📡 Connecting to database...');

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ['src/**/*.entity.ts'],
    synchronize: false,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await dataSource.initialize();
    console.log('✅ Connected to database!');

    await seedMerchantsAndMenus(dataSource);

    console.log('✅ Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main();
