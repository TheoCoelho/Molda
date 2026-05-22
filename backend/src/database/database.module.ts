import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/User.entity';
import { Profile } from '../entities/Profile.entity';
import { RefreshToken } from '../entities/RefreshToken.entity';
import { Part } from '../entities/Part.entity';
import { ProductType } from '../entities/ProductType.entity';
import { ProductSubtype } from '../entities/ProductSubtype.entity';
import { Material } from '../entities/Material.entity';
import { PrintingMethod } from '../entities/PrintingMethod.entity';
import { MaterialPrintingMethod } from '../entities/MaterialPrintingMethod.entity';
import { Product } from '../entities/Product.entity';
import { ProductMaterial } from '../entities/ProductMaterial.entity';
import { SubtypeMaterial } from '../entities/SubtypeMaterial.entity';
import { Inventory } from '../entities/Inventory.entity';
import { ProductImage } from '../entities/ProductImage.entity';
import { Order } from '../entities/Order.entity';
import { OrderEvent } from '../entities/OrderEvent.entity';
import { ProjectDraft } from '../entities/ProjectDraft.entity';
import { GalleryItem } from '../entities/GalleryItem.entity';
import { ProfileAddress } from '../entities/ProfileAddress.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST') || 'localhost',
        port: configService.get('DB_PORT') || 5432,
        username: configService.get('DB_USER') || 'postgres',
        password: configService.get('DB_PASSWORD') || 'postgres',
        database: configService.get('DB_NAME') || 'molda_db',
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
        migrations: [__dirname + '/migrations/*.js', __dirname + '/migrations/*.ts'],
        migrationsRun: true,
        synchronize: false,
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
