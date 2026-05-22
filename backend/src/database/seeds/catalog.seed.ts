import { DataSource } from 'typeorm';
import { User } from '../../entities/User.entity';
import { Profile } from '../../entities/Profile.entity';
import { RefreshToken } from '../../entities/RefreshToken.entity';
import { Part } from '../../entities/Part.entity';
import { ProductType } from '../../entities/ProductType.entity';
import { ProductSubtype } from '../../entities/ProductSubtype.entity';
import { Material } from '../../entities/Material.entity';
import { PrintingMethod } from '../../entities/PrintingMethod.entity';
import { MaterialPrintingMethod } from '../../entities/MaterialPrintingMethod.entity';
import { Product } from '../../entities/Product.entity';
import { ProductMaterial } from '../../entities/ProductMaterial.entity';
import { SubtypeMaterial } from '../../entities/SubtypeMaterial.entity';
import { Inventory } from '../../entities/Inventory.entity';
import { ProductImage } from '../../entities/ProductImage.entity';
import { Order } from '../../entities/Order.entity';
import { OrderEvent } from '../../entities/OrderEvent.entity';
import { ProjectDraft } from '../../entities/ProjectDraft.entity';
import { GalleryItem } from '../../entities/GalleryItem.entity';
import { ProfileAddress } from '../../entities/ProfileAddress.entity';

export const runSeed = async (dataSource: DataSource | null) => {
  // Create data source if not provided (for standalone seed execution)
  const connection = dataSource || new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: (process.env.DB_PORT && parseInt(process.env.DB_PORT)) || 5432,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'molda_db',
    entities: [
      User,
      Profile,
      RefreshToken,
      Part,
      ProductType,
      ProductSubtype,
      Material,
      PrintingMethod,
      MaterialPrintingMethod,
      Product,
      ProductMaterial,
      SubtypeMaterial,
      Inventory,
      ProductImage,
      Order,
      OrderEvent,
      ProjectDraft,
      GalleryItem,
      ProfileAddress,
    ],
  });

  if (!dataSource) {
    await (connection as DataSource).initialize();
  }

  const partsRepository = (connection as DataSource).getRepository(Part);
  const materialsRepository = (connection as DataSource).getRepository(Material);
  const printingMethodsRepository = (connection as DataSource).getRepository(PrintingMethod);

  console.log('🌱 Seeding database...');

  // Seed Parts
  const partsData = [
    { slug: 'head', name: 'Cabeça', description: 'Bonés, toucas e chapéus', sort_order: 1 },
    { slug: 'torso', name: 'Tronco', description: 'Camisetas, camisas e jaquetas', sort_order: 2 },
    { slug: 'legs', name: 'Pernas', description: 'Calças, shorts e bermudas', sort_order: 3 },
  ];

  for (const part of partsData) {
    const existing = await partsRepository.findOne({ where: { slug: part.slug } });
    if (!existing) {
      await partsRepository.save(partsRepository.create(part));
      console.log(`✓ Part: ${part.name}`);
    }
  }

  // Seed Materials
  const materialsData = [
    { name: 'Algodão', description: 'Algodão 100%' },
    { name: 'Poliéster', description: 'Poliéster sintético' },
    { name: 'Malha', description: 'Malha de algodão' },
  ];

  for (const material of materialsData) {
    const existing = await materialsRepository.findOne({ where: { name: material.name } });
    if (!existing) {
      await materialsRepository.save(materialsRepository.create(material));
      console.log(`✓ Material: ${material.name}`);
    }
  }

  // Seed Printing Methods
  const printingMethodsData = [
    { code: 'screen', name: 'Serigrafia', description: 'Impressão por serigrafia' },
    { code: 'dtf', name: 'DTF', description: 'Direct-to-Film' },
    { code: 'embroidery', name: 'Bordado', description: 'Bordado computadorizado' },
  ];

  for (const method of printingMethodsData) {
    const existing = await printingMethodsRepository.findOne({ where: { code: method.code } });
    if (!existing) {
      await printingMethodsRepository.save(printingMethodsRepository.create(method));
      console.log(`✓ Printing Method: ${method.name}`);
    }
  }

  console.log('✅ Seed completed!');

  if (!dataSource) {
    await (connection as DataSource).destroy();
  }
};

// Execute if run directly
if (require.main === module) {
  runSeed(null).catch(console.error);
}
