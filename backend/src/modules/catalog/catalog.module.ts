import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Part } from '../../entities/Part.entity';
import { ProductType } from '../../entities/ProductType.entity';
import { ProductSubtype } from '../../entities/ProductSubtype.entity';
import { Product } from '../../entities/Product.entity';
import { ProductMaterial } from '../../entities/ProductMaterial.entity';
import { SubtypeMaterial } from '../../entities/SubtypeMaterial.entity';
import { Inventory } from '../../entities/Inventory.entity';
import { ProductImage } from '../../entities/ProductImage.entity';
import { Material } from '../../entities/Material.entity';
import { PrintingMethod } from '../../entities/PrintingMethod.entity';
import { MaterialPrintingMethod } from '../../entities/MaterialPrintingMethod.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Part,
      ProductType,
      ProductSubtype,
      Product,
      ProductMaterial,
      SubtypeMaterial,
      Inventory,
      ProductImage,
      Material,
      PrintingMethod,
      MaterialPrintingMethod,
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
