import { DataSource } from 'typeorm';
import { Merchant } from './entities/merchant.entity';
import { MenuItem } from './entities/menu-item.entity';

/**
 * 🌱 SEED DATABASE WITH REAL KIGALI RESTAURANTS
 * Run this to populate the database with initial restaurant and menu data
 */
export async function seedMerchantsAndMenus(dataSource: DataSource) {
  const merchantRepository = dataSource.getRepository(Merchant);
  const menuItemRepository = dataSource.getRepository(MenuItem);

  console.log('🌱 Seeding merchants and menus...');

  // Check if data already exists
  const existing = await merchantRepository.count();
  if (existing > 0) {
    console.log('✅ Merchants already seeded. Skipping...');
    return;
  }

  // REAL RESTAURANTS IN KIGALI
  const merchants = [
    {
      name: 'Heaven Restaurant',
      category: 'Fine Dining',
      rating: 4.7,
      deliveryTime: '30-40 min',
      deliveryFee: 1500,
      prepTime: 25,
      image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400',
      cuisine: ['International', 'Rwandan', 'Grill'],
      location: 'Kacyiru, Kigali',
      latitude: -1.9442,
      longitude: 30.0619,
      phone: '+250788123456',
      description: 'Fine dining with stunning city views',
      hours: {
        monday: { open: '11:00', close: '22:00' },
        tuesday: { open: '11:00', close: '22:00' },
        wednesday: { open: '11:00', close: '22:00' },
        thursday: { open: '11:00', close: '22:00' },
        friday: { open: '11:00', close: '23:00' },
        saturday: { open: '11:00', close: '23:00' },
        sunday: { open: '12:00', close: '21:00' },
      },
      isActive: true,
      isVerified: true,
    },
    {
      name: 'Repub Lounge',
      category: 'Bar & Grill',
      rating: 4.6,
      deliveryTime: '25-35 min',
      deliveryFee: 1200,
      prepTime: 20,
      image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400',
      cuisine: ['Burgers', 'Pizza', 'Grills'],
      location: 'Nyarutarama, Kigali',
      latitude: -1.9367,
      longitude: 30.1177,
      phone: '+250788234567',
      description: 'Casual dining with great burgers and pizzas',
      hours: {
        monday: { open: '10:00', close: '23:00' },
        tuesday: { open: '10:00', close: '23:00' },
        wednesday: { open: '10:00', close: '23:00' },
        thursday: { open: '10:00', close: '23:00' },
        friday: { open: '10:00', close: '00:00' },
        saturday: { open: '10:00', close: '00:00' },
        sunday: { open: '10:00', close: '22:00' },
      },
      isActive: true,
      isVerified: true,
    },
    {
      name: 'Meze Fresh',
      category: 'Healthy Food',
      rating: 4.5,
      deliveryTime: '20-30 min',
      deliveryFee: 1000,
      prepTime: 15,
      image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400',
      cuisine: ['Salads', 'Smoothies', 'Healthy'],
      location: 'Kimihurura, Kigali',
      latitude: -1.9536,
      longitude: 30.0910,
      phone: '+250788345678',
      description: 'Fresh and healthy meals delivered to your door',
      hours: {
        monday: { open: '08:00', close: '20:00' },
        tuesday: { open: '08:00', close: '20:00' },
        wednesday: { open: '08:00', close: '20:00' },
        thursday: { open: '08:00', close: '20:00' },
        friday: { open: '08:00', close: '20:00' },
        saturday: { open: '09:00', close: '18:00' },
        sunday: { open: '09:00', close: '18:00' },
      },
      isActive: true,
      isVerified: true,
    },
  ];

  // Save merchants
  const savedMerchants: Merchant[] = [];
  for (const merchantData of merchants) {
    const merchant = merchantRepository.create(merchantData);
    const saved = await merchantRepository.save(merchant);
    savedMerchants.push(saved);
    console.log(`✅ Created merchant: ${saved.name} (ID: ${saved.id})`);
  }

  // MENU ITEMS FOR EACH RESTAURANT
  const menuItemsData = [
    // Heaven Restaurant (ID: 1)
    {
      merchantId: savedMerchants[0].id,
      items: [
        { name: 'Grilled Tilapia', price: 8000, category: 'Main Course', image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=200', description: 'Fresh tilapia grilled to perfection', isPopular: true },
        { name: 'Beef Brochettes', price: 7000, category: 'Main Course', image: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=200', description: 'Tender beef skewers with vegetables', isPopular: true },
        { name: 'Isombe (Cassava Leaves)', price: 6000, category: 'Main Course', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200', description: 'Traditional Rwandan dish', isVegetarian: true },
        { name: 'Vegetable Salad', price: 3500, category: 'Sides', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200', description: 'Fresh mixed greens', isVegetarian: true, isVegan: true },
        { name: 'French Fries', price: 2500, category: 'Sides', image: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=200', description: 'Crispy golden fries', isVegetarian: true },
        { name: 'Passion Fruit Juice', price: 2000, category: 'Drinks', image: 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=200', description: 'Fresh local juice', isVegetarian: true, isVegan: true },
      ],
    },
    // Repub Lounge (ID: 2)
    {
      merchantId: savedMerchants[1].id,
      items: [
        { name: 'Classic Burger', price: 6000, category: 'Burgers', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200', description: 'Beef patty with cheese and fries', isPopular: true },
        { name: 'Chicken Burger', price: 5500, category: 'Burgers', image: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=200', description: 'Grilled chicken burger' },
        { name: 'Margherita Pizza', price: 8500, category: 'Pizza', image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=200', description: 'Classic tomato and mozzarella', isVegetarian: true },
        { name: 'BBQ Chicken Pizza', price: 9500, category: 'Pizza', image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200', description: 'BBQ sauce, chicken, and cheese', isPopular: true },
        { name: 'Buffalo Wings', price: 7000, category: 'Appetizers', image: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=200', description: 'Spicy chicken wings', isSpicy: true },
        { name: 'Loaded Fries', price: 4000, category: 'Sides', image: 'https://images.unsplash.com/photo-1630384344016-59e6cd6f9dd7?w=200', description: 'Fries with cheese and bacon' },
      ],
    },
    // Meze Fresh (ID: 3)
    {
      merchantId: savedMerchants[2].id,
      items: [
        { name: 'Greek Salad', price: 4500, category: 'Salads', image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=200', description: 'Fresh vegetables with feta cheese', isVegetarian: true, isPopular: true },
        { name: 'Caesar Salad', price: 5000, category: 'Salads', image: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=200', description: 'Romaine lettuce with caesar dressing', isVegetarian: true },
        { name: 'Grilled Chicken Bowl', price: 6000, category: 'Bowls', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200', description: 'Chicken with quinoa and veggies', isPopular: true },
        { name: 'Avocado Toast', price: 4000, category: 'Breakfast', image: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=200', description: 'Whole grain toast with avocado', isVegetarian: true, isVegan: true },
        { name: 'Green Smoothie', price: 3500, category: 'Smoothies', image: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=200', description: 'Spinach, banana, and mango', isVegetarian: true, isVegan: true },
        { name: 'Berry Blast Smoothie', price: 3500, category: 'Smoothies', image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=200', description: 'Mixed berries smoothie', isVegetarian: true, isVegan: true },
      ],
    },
  ];

  // Save menu items
  for (const merchantMenu of menuItemsData) {
    for (const itemData of merchantMenu.items) {
      const menuItem = menuItemRepository.create({
        ...itemData,
        merchantId: merchantMenu.merchantId,
        isAvailable: true,
      });
      const saved = await menuItemRepository.save(menuItem);
      console.log(`  ✅ Created menu item: ${saved.name} (ID: ${saved.id})`);
    }
  }

  console.log('✅ Seeding complete!');
}
