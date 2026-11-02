/**
 * DEVELOPMENT FIXTURES — for testing the cart, MOQ validation, filters and
 * multi-supplier fulfilment before real suppliers are onboarded.
 *
 * Safety rules:
 *  - Refuses to run when NODE_ENV=production.
 *  - Every fixture row has isFixture=true and a "[DEV FIXTURE]" label.
 *  - The API hides fixtures unless ENABLE_DEV_FIXTURES=true AND NODE_ENV != production.
 *  - Remove them at any time with: npm run seed:dev-fixtures -w server -- --remove
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to create development fixtures in production.');
  process.exit(1);
}

const prisma = new PrismaClient();
const LABEL = '[DEV FIXTURE]';

async function remove() {
  const users = await prisma.user.findMany({ where: { supplier: { isFixture: true } }, select: { id: true } });
  await prisma.cartItem.deleteMany({ where: { product: { isFixture: true } } });
  const sos = await prisma.supplierOrder.findMany({ where: { supplier: { isFixture: true } }, select: { id: true, orderId: true } });
  await prisma.order.deleteMany({ where: { id: { in: sos.map((s) => s.orderId) } } });
  await prisma.product.deleteMany({ where: { isFixture: true } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  console.info(`[fixtures] Removed ${users.length} fixture suppliers and their listings/orders.`);
}

interface FixtureProduct {
  title: string;
  categoryPath: string;
  pricePaise: number;
  priceUnit?: 'PIECE' | 'SET' | 'METRE' | 'PAIR';
  piecesPerSet?: number;
  moq: number;
  orderStep?: number;
  attributes: Record<string, string[]>;
  variants?: { size?: string; colour?: string }[];
}

const SUPPLIERS: { key: string; city: string; state: string; products: FixtureProduct[] }[] = [
  {
    key: 'a',
    city: 'Bengaluru',
    state: 'Karnataka',
    products: [
      { title: 'Test Silk Saree A1', categoryPath: 'womens-wear/sarees', pricePaise: 100000, moq: 10, attributes: { fabric: ['Silk'], occasion: ['Wedding', 'Festive'], sareeStyle: ['Mysore Silk'], work: ['Zari'], colour: ['Maroon'] } },
      { title: 'Test Cotton Saree A2', categoryPath: 'womens-wear/sarees', pricePaise: 40000, moq: 25, orderStep: 5, attributes: { fabric: ['Cotton'], occasion: ['Daily Wear'], sareeStyle: ['Regular Drape'], work: ['Printed'], colour: ['Blue'] } },
      {
        title: 'Test Straight Kurti A3', categoryPath: 'womens-wear/kurtis', pricePaise: 30000, moq: 30,
        attributes: { kurtiType: ['Straight'], length: ['Knee Length'], sleeve: ['Three-Quarter'], neck: ['Round'], fabric: ['Rayon'], pattern: ['Printed'] },
        variants: [{ size: 'M', colour: 'Yellow' }, { size: 'L', colour: 'Yellow' }, { size: 'XL', colour: 'Yellow' }],
      },
    ],
  },
  {
    key: 'b',
    city: 'Surat',
    state: 'Gujarat',
    products: [
      { title: 'Test Georgette Saree B1', categoryPath: 'womens-wear/sarees', pricePaise: 65000, moq: 50, attributes: { fabric: ['Georgette'], occasion: ['Party'], sareeStyle: ['Regular Drape'], work: ['Sequins'], colour: ['Black'] } },
      {
        title: 'Test Anarkali Kurti B2', categoryPath: 'womens-wear/kurtis', pricePaise: 55000, moq: 12, priceUnit: 'SET', piecesPerSet: 4,
        attributes: { kurtiType: ['Anarkali'], length: ['Calf Length'], sleeve: ['Full Sleeve'], neck: ['V-Neck'], fabric: ['Georgette'], pattern: ['Embroidered'] },
        variants: [{ size: 'S', colour: 'Pink' }, { size: 'M', colour: 'Pink' }, { size: 'L', colour: 'Green' }],
      },
      { title: 'Test Cotton Shirt B3', categoryPath: 'mens-wear/shirts', pricePaise: 35000, moq: 100, attributes: { garmentType: ['Formal Shirt'], fit: ['Slim'], sleeve: ['Full Sleeve'], fabric: ['Cotton'], pattern: ['Solid'] }, variants: [{ size: '38', colour: 'White' }, { size: '40', colour: 'White' }, { size: '42', colour: 'White' }] },
    ],
  },
];

async function create() {
  await remove();
  const password = process.env.FIXTURE_PASSWORD ?? 'fixture-only-password-1';
  const passwordHash = await bcrypt.hash(password, 10);
  for (const s of SUPPLIERS) {
    const user = await prisma.user.create({
      data: {
        email: `fixture-supplier-${s.key}@dev.invalid`,
        passwordHash,
        fullName: `${LABEL} Supplier ${s.key.toUpperCase()} Contact`,
        role: 'SUPPLIER',
        businessType: 'WHOLESALER',
        supplier: {
          create: {
            businessName: `${LABEL} Test Supplier ${s.key.toUpperCase()}`,
            businessType: 'WHOLESALER',
            contactName: 'Fixture Contact',
            phone: '9000000000',
            city: s.city,
            state: s.state,
            addressLine: 'Development fixture — not a real business',
            pincode: '560001',
            categoryPaths: [...new Set(s.products.map((p) => p.categoryPath))],
            description: 'This is a development fixture used for testing. It is not a real supplier.',
            status: 'APPROVED', // fixtures only; real suppliers always start INCOMPLETE
            isVerified: false,
            isFixture: true,
          },
        },
      },
      include: { supplier: true },
    });
    for (const p of s.products) {
      const category = await prisma.category.findUniqueOrThrow({ where: { path: p.categoryPath } });
      await prisma.product.create({
        data: {
          supplierId: user.supplier!.id,
          categoryId: category.id,
          title: `${LABEL} ${p.title}`,
          slug: p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: 'Development fixture listing used to test cart, MOQ and filters. Not a real product and not available for purchase.',
          pricePaise: p.pricePaise,
          priceUnit: p.priceUnit ?? 'PIECE',
          piecesPerSet: p.piecesPerSet ?? null,
          moq: p.moq,
          orderStep: p.orderStep ?? 1,
          attributes: p.attributes as Prisma.InputJsonValue,
          status: 'APPROVED',
          approvedAt: new Date(),
          isFixture: true,
          variants: { create: (p.variants ?? []).map((v) => ({ size: v.size ?? null, colour: v.colour ?? null })) },
        },
      });
    }
  }
  console.info(`[fixtures] Created ${SUPPLIERS.length} fixture suppliers. Visible only with ENABLE_DEV_FIXTURES=true outside production.`);
}

(process.argv.includes('--remove') ? remove() : create())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
