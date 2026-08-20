import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding 6 products for Ace Orbits...');

  // 1. Get or Create a Category
  let category = await prisma.category.findFirst();
  if (!category) {
    category = await prisma.category.create({
      data: {
        name: 'General',
        slug: 'general-' + Math.random().toString(36).substring(7),
        is_active: true,
      }
    });
  }

  // 2. Get or Create a Unit
  let unit = await prisma.unit.findFirst();
  if (!unit) {
    unit = await prisma.unit.create({
      data: {
        code: 'PCS',
        name: 'Pcs',
        is_active: true,
      }
    });
  }

  const products = [
    {
      name: 'Engine Oil - Premium 4L',
      sku: 'OIL-PREM-4L',
      barcode: '8901234567890',
      description: 'High-quality synthetic engine oil',
      purchase_rate: 3500,
      sales_rate_inc_dis_and_tax: 4500,
      stock: 50,
    },
    {
      name: 'Brake Pads Set - Front',
      sku: 'BRK-SET-FR',
      barcode: '8901234567891',
      description: 'Durable ceramic brake pads',
      purchase_rate: 1200,
      sales_rate_inc_dis_and_tax: 1800,
      stock: 20,
    },
    {
      name: 'Oil Filter - Toyota Altis',
      sku: 'FLT-OIL-TYT',
      barcode: '8901234567892',
      description: 'Genuine oil filter replacement',
      purchase_rate: 450,
      sales_rate_inc_dis_and_tax: 650,
      stock: 100,
    },
    {
      name: 'Air Filter - Honda Civic',
      sku: 'FLT-AIR-HON',
      barcode: '8901234567893',
      description: 'High-flow replacement air filter',
      purchase_rate: 800,
      sales_rate_inc_dis_and_tax: 1200,
      stock: 30,
    },
    {
      name: 'Coolant - Blue 2L',
      sku: 'CLT-BLU-2L',
      barcode: '8901234567894',
      description: 'Pre-mixed long-life coolant',
      purchase_rate: 1500,
      sales_rate_inc_dis_and_tax: 2200,
      stock: 40,
    },
    {
      name: 'Spark Plug Set (4pcs)',
      sku: 'SPK-PLG-4',
      barcode: '8901234567895',
      description: 'Iridium spark plugs for better ignition',
      purchase_rate: 2800,
      sales_rate_inc_dis_and_tax: 3800,
      stock: 15,
    }
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        name: p.name,
        sku: p.sku,
        code: p.barcode,
        description: p.description,
        purchase_rate: p.purchase_rate,
        sales_rate_inc_dis_and_tax: p.sales_rate_inc_dis_and_tax,
        category_id: category.id,
        unit_id: unit.id,
        is_active: true,
      }
    });
    console.log(`Created/Updated: ${p.name}`);
  }

  console.log('Seeding complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
