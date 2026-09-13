import { Injectable } from '@nestjs/common';

@Injectable()
export class MerchantsService {
  // Helper to check if restaurant is currently open
  private isCurrentlyOpen(hours: any): boolean {
    const now = new Date();
    const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

    const todayHours = hours[currentDay];
    if (!todayHours || !todayHours.open || !todayHours.close) {
      return false;
    }

    const [openHour, openMin] = todayHours.open.split(':').map(Number);
    const [closeHour, closeMin] = todayHours.close.split(':').map(Number);

    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;

    return currentTime >= openTime && currentTime < closeTime;
  }

  // Helper to get next opening time
  private getNextOpeningTime(hours: any): string {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];

    // Check if opens later today
    const todayHours = hours[currentDay];
    if (todayHours && todayHours.open) {
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [openHour, openMin] = todayHours.open.split(':').map(Number);
      const openTime = openHour * 60 + openMin;

      if (currentTime < openTime) {
        return `Opens at ${todayHours.open}`;
      }
    }

    // Check tomorrow
    const tomorrowIndex = (now.getDay() + 1) % 7;
    const tomorrow = days[tomorrowIndex];
    const tomorrowHours = hours[tomorrow];

    if (tomorrowHours && tomorrowHours.open) {
      return `Opens tomorrow at ${tomorrowHours.open}`;
    }

    return 'Opens soon';
  }

  private merchants = [
    {
      id: '1',
      name: 'Bourbon Coffee',
      category: 'Coffee & Cafe',
      rating: 4.8,
      deliveryTime: '15-25 min',
      deliveryFee: 500,
      prepTime: 15, // minutes to prepare food
      image: 'https://via.placeholder.com/300x200/FF6B00/FFFFFF?text=Bourbon+Coffee',
      cuisine: ['Coffee', 'Pastries', 'Breakfast'],
      location: 'Kimihurura, Kigali',
      coordinates: { lat: -1.9536, lng: 30.0910 }, // for distance calculation
      hours: {
        monday: { open: '07:00', close: '20:00' },
        tuesday: { open: '07:00', close: '20:00' },
        wednesday: { open: '07:00', close: '20:00' },
        thursday: { open: '07:00', close: '20:00' },
        friday: { open: '07:00', close: '22:00' },
        saturday: { open: '08:00', close: '22:00' },
        sunday: { open: '08:00', close: '20:00' },
      },
    },
    {
      id: '2',
      name: 'Heaven Restaurant',
      category: 'Fine Dining',
      rating: 4.7,
      deliveryTime: '30-40 min',
      deliveryFee: 800,
      prepTime: 25,
      image: 'https://via.placeholder.com/300x200/FF6B00/FFFFFF?text=Heaven+Restaurant',
      cuisine: ['International', 'Local', 'Grill'],
      location: 'Kacyiru, Kigali',
      coordinates: { lat: -1.9442, lng: 30.0619 },
      hours: {
        monday: { open: '11:00', close: '22:00' },
        tuesday: { open: '11:00', close: '22:00' },
        wednesday: { open: '11:00', close: '22:00' },
        thursday: { open: '11:00', close: '22:00' },
        friday: { open: '11:00', close: '23:00' },
        saturday: { open: '11:00', close: '23:00' },
        sunday: { open: '12:00', close: '21:00' },
      },
    },
    {
      id: '3',
      name: 'Repub Lounge',
      category: 'Bar & Grill',
      rating: 4.6,
      deliveryTime: '25-35 min',
      deliveryFee: 600,
      prepTime: 20,
      image: 'https://via.placeholder.com/300x200/FF6B00/FFFFFF?text=Repub+Lounge',
      cuisine: ['Burgers', 'Pizza', 'Drinks'],
      location: 'Nyarutarama, Kigali',
      coordinates: { lat: -1.9367, lng: 30.1177 },
      hours: {
        monday: { open: '10:00', close: '23:00' },
        tuesday: { open: '10:00', close: '23:00' },
        wednesday: { open: '10:00', close: '23:00' },
        thursday: { open: '10:00', close: '23:00' },
        friday: { open: '10:00', close: '00:00' },
        saturday: { open: '10:00', close: '00:00' },
        sunday: { open: '10:00', close: '22:00' },
      },
    },
    {
      id: '4',
      name: 'Poivre Noir',
      category: 'French Cuisine',
      rating: 4.9,
      deliveryTime: '35-45 min',
      deliveryFee: 1000,
      prepTime: 30,
      image: 'https://via.placeholder.com/300x200/FF6B00/FFFFFF?text=Poivre+Noir',
      cuisine: ['French', 'Fine Dining', 'Wine'],
      location: 'Kiyovu, Kigali',
      coordinates: { lat: -1.9590, lng: 30.0535 },
      hours: {
        monday: { open: '12:00', close: '22:00' },
        tuesday: { open: '12:00', close: '22:00' },
        wednesday: { open: '12:00', close: '22:00' },
        thursday: { open: '12:00', close: '22:00' },
        friday: { open: '12:00', close: '23:00' },
        saturday: { open: '12:00', close: '23:00' },
        sunday: null, // Closed on Sundays
      },
    },
    {
      id: '5',
      name: 'Meze Fresh',
      category: 'Healthy Food',
      rating: 4.5,
      deliveryTime: '20-30 min',
      deliveryFee: 500,
      prepTime: 15,
      image: 'https://via.placeholder.com/300x200/FF6B00/FFFFFF?text=Meze+Fresh',
      cuisine: ['Salads', 'Smoothies', 'Healthy'],
      location: 'Kimihurura, Kigali',
      coordinates: { lat: -1.9536, lng: 30.0910 },
      hours: {
        monday: { open: '08:00', close: '20:00' },
        tuesday: { open: '08:00', close: '20:00' },
        wednesday: { open: '08:00', close: '20:00' },
        thursday: { open: '08:00', close: '20:00' },
        friday: { open: '08:00', close: '20:00' },
        saturday: { open: '09:00', close: '18:00' },
        sunday: { open: '09:00', close: '18:00' },
      },
    },
  ];

  private menuItems = {
    '1': [
      { id: '1', name: 'Cappuccino', price: 3000, category: 'Coffee', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Cappuccino' },
      { id: '2', name: 'Croissant', price: 2000, category: 'Pastry', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Croissant' },
      { id: '3', name: 'Breakfast Combo', price: 5500, category: 'Breakfast', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Breakfast' },
    ],
    '2': [
      { id: '4', name: 'Grilled Tilapia', price: 8000, category: 'Main', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Tilapia' },
      { id: '5', name: 'Beef Brochettes', price: 7000, category: 'Main', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Brochettes' },
      { id: '6', name: 'Vegetable Salad', price: 3500, category: 'Sides', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Salad' },
    ],
    '3': [
      { id: '7', name: 'Classic Burger', price: 6000, category: 'Burger', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Burger' },
      { id: '8', name: 'Margherita Pizza', price: 8500, category: 'Pizza', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Pizza' },
      { id: '9', name: 'French Fries', price: 2500, category: 'Sides', image: 'https://via.placeholder.com/150/FF6B00/FFFFFF?text=Fries' },
    ],
  };

  getAllMerchants() {
    // Add dynamic isOpen and nextOpenTime to each merchant
    return this.merchants.map(merchant => ({
      ...merchant,
      isOpen: this.isCurrentlyOpen(merchant.hours),
      openingStatus: this.isCurrentlyOpen(merchant.hours)
        ? `Open until ${this.getClosingTime(merchant.hours)}`
        : this.getNextOpeningTime(merchant.hours),
    }));
  }

  private getClosingTime(hours: any): string {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    const todayHours = hours[currentDay];

    if (todayHours && todayHours.close) {
      return todayHours.close;
    }

    return 'later';
  }

  getMerchantById(id: string) {
    return this.merchants.find(m => m.id === id);
  }

  getMenuItems(merchantId: string) {
    return this.menuItems[merchantId] || [];
  }
}
