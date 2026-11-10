const { loadEnv } = require('../config/env');
const { connectDb, disconnectDb } = require('../config/db');
const Category = require('../models/Category');
const Saree = require('../models/Saree');
const Content = require('../models/Content');
const SystemConfig = require('../models/SystemConfig');

const CATEGORIES = [
  { id: 'sarees', label: 'Kanchipuram', sortOrder: 1 },
  { id: 'katan', label: 'Banarasi', sortOrder: 2 },
  { id: 'bridal', label: 'Bridal', sortOrder: 3 },
  { id: 'tissue', label: 'Tissue', sortOrder: 4 },
  { id: 'paithani', label: 'Paithani', sortOrder: 5 },
];

const SAREES = [
  ['saree-1', 'swarna-kanchipuram', 'sarees', 'Tripuraa Heritage', 'Swarna Kanchipuram Pure Zari Silk', 28500, 34000, 'Kanchipuram Handloom', 'Pure Mulberry Silk', 'Gold & Silver Zari', 'Kanchipuram, Tamil Nadu', 'gold', 'Authentic temple border Kanchipuram handwoven on traditional pit looms with pure gold and silver dipped tested zari and sacred korvai motifs.', '1 Heritage Weave Left', 1, true],
  ['saree-2', 'emerald-brocade', 'katan', 'Heritage Katan', 'Emerald Brocade Royal Zari Drape', 38000, 44500, 'Banarasi Katan Silk', 'Pure Katan Silk', 'Antique Tested Zari', 'Varanasi, Uttar Pradesh', 'emerald', 'Classic Banarasi brocade woven in lustrous emerald green with kadhwa floral jaal and antique gold zari pallu.', 'Handcrafted on Order', 4, true],
  ['saree-3', 'crimson-bridal', 'bridal', 'Varanasi Royal', 'Crimson Bridal Handwoven Silk', 32900, 39000, 'Varanasi Bridal Weave', 'Pure Silk', 'Royal Saffron Zari', 'Varanasi, Uttar Pradesh', 'crimson', 'Exquisite bridal heirloom in deep crimson adorned with intricate floral jaal and meenakari craftsmanship.', '2 Pieces Crafted', 2, true],
  ['saree-4', 'gulabi-temple', 'sarees', 'Tripuraa Couture', 'Gulabi Pure Temple Kanchipuram', 27500, 32000, 'Temple Border Silk', 'Pure Handloom Silk', 'Pure Zari Pallu', 'Kanchipuram, Tamil Nadu', 'pink', 'Auspicious rose pink silk paired with a deep purple border and traditional rudraksha korvai weave.', 'In Stock', 3, false],
  ['saree-5', 'royal-bridal-tissue', 'tissue', 'Swarna Mandir', 'Royal Bridal Gold Tissue Drape', 45000, 52000, 'Tissue Brocade Handloom', 'Pure Silk & Tissue', 'Fine Gold Zari', 'Chanderi & Varanasi', 'gold', 'Shimmering metallic gold tissue warp handwoven with pure mulberry silk weft.', 'Exclusive Single Weave', 1, true],
  ['saree-6', 'peacock-paithani', 'paithani', 'Maharani Weaves', 'Peacock Blue Paithani Silk Saree', 34500, 40000, 'Yeola Handloom Paithani', 'Pure Silk', 'Gold Zari Asawali Border', 'Yeola, Maharashtra', 'blue', 'Traditional Yeola Paithani featuring mor-bangadi motifs and a hand-knotted gold zari pallu.', 'In Stock', 3, false],
  ['saree-7', 'rani-shikargah', 'katan', 'Kashi Heritage', 'Rani Pink Shikargah Brocade', 41200, 48000, 'Shikargah Banarasi Handloom', 'Pure Katan Silk', 'Antique Sona-Rupa Zari', 'Varanasi, Uttar Pradesh', 'pink', 'Historical hunting scene woven with dual-toned sona and rupa zari.', 'Rare Heritage Masterpiece', 1, false],
  ['saree-8', 'sindhuri-bridal', 'bridal', 'Tripuraa Bridal', 'Sindhuri Scarlet Bridal Trousseau', 49500, 58000, 'Heritage Bridal Brocade', 'Pure Mulberry Silk', 'Heavy Floral Zari Pallu', 'Kanchipuram, Tamil Nadu', 'crimson', 'Scarlet red pure silk hand-loomed with ceremonial paisley bootas and a grand gold pallu.', 'Limited Edition', 2, true],
  ['saree-9', 'haldi-mustard', 'sarees', 'Dakshin Silks', 'Haldi Mustard Kanchipuram Silk', 26800, 31000, 'Kanchipuram Korvai', 'Pure Silk', 'Ganga-Jamuna Zari Border', 'Kanchipuram, Tamil Nadu', 'gold', 'Bright turmeric yellow drape with dual contrasting borders for haldi and morning ceremonies.', 'In Stock', 4, false],
  ['saree-10', 'silver-mist-tissue', 'tissue', 'Ratnaavali Silks', 'Silver Mist Tissue Organza Silk', 36000, 42000, 'Tissue Organza Weave', 'Pure Tissue Organza', 'Fine Silver Zari Work', 'Chanderi, Madhya Pradesh', 'silver', 'Sheer tissue drape with delicate silver zari threads for an evening glow.', 'Single Artisanal Piece', 1, false],
];

const FAQ = [
  ['1', 'Are all sarees 100% pure silk and certified?', 'Each handloom drape carries a Silk Mark and a tested zari certificate, sourced from weaver clusters in Kanchipuram, Varanasi, and Paithan.'],
  ['2', 'How do I care for pure zari and heirloom handlooms?', 'Dry clean only. Store folded in unbleached cotton and refold every few months. Avoid metal hangers.'],
  ['3', 'Can I schedule a bespoke bridal consultation?', 'Yes. Private consultations are available at the Jubilee Hills atelier or over WhatsApp video. Loom commissions take 4–8 weeks.'],
  ['4', 'What is the shipping timeline and transit insurance?', 'Domestic orders ship within 24–48 hours and usually arrive in 3–5 business days. International dispatches take 5–8 business days. Shipments are insured.'],
  ['5', 'What is your exchange and return policy?', 'Unused sarees with security tags intact can be exchanged within 7 days. Custom loom commissions are made to order and are not refundable.'],
  ['6', 'How does the AI Virtual Try-On work?', 'The studio sends your portrait and the flat saree photo to the drape provider, then stores the result. Portraits are private and removed when you delete your account.'],
];

function imagesFor() {
  return [];
}

async function upsertContent(key, data) {
  await Content.updateOne({ key }, { $set: { data } }, { upsert: true });
}

async function seed() {
  for (const category of CATEGORIES) {
    await Category.updateOne(
      { id: category.id },
      { $set: { ...category, coverImageUrl: '', isActive: true } },
      { upsert: true },
    );
  }

  for (let index = 0; index < SAREES.length; index += 1) {
    const [id, slug, category, brand, title, price, mrp, weave, fabric, zari, origin, colorTheme, description, stockStatus, stockQuantity, isFeatured] = SAREES[index];
    const images = imagesFor();
    await Saree.updateOne(
      { id },
      {
        $set: {
          slug, category, brand, title, price, mrp, weave, fabric, zari, origin, colorTheme, description,
          stockStatus, stockQuantity, isFeatured, isActive: true, deletedAt: null,
          flatImageUrl: '',
          defaultTryOnImageUrl: '',
          images,
        },
      },
      { upsert: true },
    );
  }

  await upsertContent('hero', {
    title: 'Tripuraa Sangrahah',
    subtitle: 'Heirloom handloom sarees, draped on you.',
    videoUrl: '',
    posterUrl: '',
    isActive: true,
  });
  await upsertContent('store', {
    name: 'Tripuraa Sangrahah Loom House',
    tagline: 'Flagship Handloom Studio & Atelier',
    addressLine1: 'Road No. 36, Jubilee Hills',
    addressLine2: 'Hyderabad, Telangana 500033',
    landmark: 'Near Peddamma Temple Metro Station',
    timings: 'Open Daily: 10:30 AM – 8:30 PM',
    latitude: 17.4326,
    longitude: 78.4071,
    mapsQuery: 'Tripuraa Sangrahah, Road No 36, Jubilee Hills, Hyderabad, Telangana 500033',
  });
  await upsertContent('support', {
    channels: [
      { id: 'whatsapp', type: 'whatsapp', label: 'WhatsApp', value: '+919876543210', message: 'Namaste Tripuraa Sangrahah!', sortOrder: 1 },
      { id: 'instagram', type: 'instagram', label: 'Instagram', value: 'tripuraasangrahah', message: '', sortOrder: 2 },
      { id: 'helpline', type: 'phone', label: 'Helpline', value: '18008907264', message: '1800-890-SANGRAH', sortOrder: 3 },
    ],
  });
  await upsertContent('faq', {
    items: FAQ.map(([id, question, answer], sortOrder) => ({ id, question, answer, sortOrder })),
  });
  await upsertContent('legal-terms', {
    title: 'Terms of Use',
    markdown: 'Orders are confirmed only after the atelier accepts your enquiry. Custom weaves are made to order.',
    sections: [
      { title: 'Orders', content: 'An enquiry is a request, not a paid checkout. The atelier confirms price, weave time, and dispatch.' },
      { title: 'Try-on', content: 'Portraits are used only to generate a drape and are deleted when you delete your account.' },
    ],
    updatedAt: new Date().toISOString(),
  });
  await upsertContent('legal-policy', {
    title: 'Privacy Policy',
    markdown: 'We store your account, wishlist, enquiries, and try-on photos so the app can work.',
    sections: [
      { title: 'What we store', content: 'Name, email, phone, saved looks, and enquiry messages.' },
      { title: 'Photos', content: 'Portrait files stay private. They are sent to the try-on provider only when you generate a drape.' },
    ],
    updatedAt: new Date().toISOString(),
  });

  await SystemConfig.updateOne(
    { singleton: 'system' },
    {
      $setOnInsert: {
        singleton: 'system',
        minAppVersion: '1.0.0',
        forceUpdate: false,
        maintenanceMode: false,
        featureFlags: { tryOnEnabled: true, enableBespokeConcierge: true, enableInternationalShipping: false },
        tryOnDailyLimitPerUser: 20,
        tryOnUserRateMax: 8,
        tryOnUserRateWindowMs: 10 * 60 * 1000,
        tryOnModel: 'tryon-v1.6',
      },
    },
    { upsert: true },
  );
}

async function main() {
  loadEnv();
  await connectDb();
  await seed();
  console.log('Seed complete: categories, sarees, content, and system config.');
  await disconnectDb();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { seed };
