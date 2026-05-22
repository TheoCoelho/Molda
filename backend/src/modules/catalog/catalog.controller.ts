import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('product-types')
  async getProductTypes(@Query('partId') partId?: string) {
    return this.catalogService.getProductTypes(partId);
  }

  @Get('product-subtypes')
  async getProductSubtypes(@Query('typeId') typeId?: string) {
    return this.catalogService.getProductSubtypes(typeId);
  }

  @Get('materials')
  async getMaterials() {
    return this.catalogService.getMaterials();
  }

  @Get('products')
  async getProducts() {
    return this.catalogService.getProducts();
  }

  @Get('inventory')
  async getInventory() {
    return this.catalogService.getInventory();
  }

  @Get('material-printing-methods')
  async getMaterialPrintingMethods() {
    return this.catalogService.getMaterialPrintingMethods();
  }

  @Get('product-materials')
  async getProductMaterials() {
    return this.catalogService.getProductMaterials();
  }

  @Get('subtype-materials')
  async getSubtypeMaterials() {
    return this.catalogService.getSubtypeMaterials();
  }

  @Get('printing-methods')
  async getPrintingMethods() {
    return this.catalogService.getPrintingMethods();
  }

  @Get('parts')
  async getParts() {
    return this.catalogService.getParts();
  }

  @Post('parts/ensure')
  async ensurePart(
    @Body()
    payload: {
      slug?: string;
      name?: string;
      description?: string | null;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.catalogService.ensurePart(payload);
  }

  @Post('product-types')
  async createProductType(
    @Body()
    payload: {
      part_id: string;
      slug: string;
      name: string;
      description?: string | null;
      card_image_path?: string | null;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.catalogService.createProductType(payload);
  }

  @Patch('product-types/:id')
  async updateProductType(
    @Param('id') id: string,
    @Body()
    payload: {
      part_id?: string;
      slug?: string;
      name?: string;
      description?: string | null;
      card_image_path?: string | null;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.catalogService.updateProductType(id, payload);
  }

  @Post('materials')
  async createMaterial(
    @Body()
    payload: {
      name: string;
      description?: string | null;
      is_active?: boolean;
    },
  ) {
    return this.catalogService.createMaterial(payload);
  }

  @Patch('materials/:id')
  async updateMaterial(
    @Param('id') id: string,
    @Body()
    payload: {
      name?: string;
      description?: string | null;
      is_active?: boolean;
    },
  ) {
    return this.catalogService.updateMaterial(id, payload);
  }

  @Post('products')
  async createProduct(
    @Body()
    payload: {
      type_id: string;
      subtype_id?: string | null;
      material_id: string;
      sku: string;
      name: string;
      description?: string | null;
      available_colors?: string[] | null;
      available?: boolean;
      visible?: boolean;
      cover_image_path?: string | null;
    },
  ) {
    return this.catalogService.createProduct(payload);
  }

  @Patch('products/:id')
  async updateProduct(
    @Param('id') id: string,
    @Body()
    payload: {
      type_id?: string;
      subtype_id?: string | null;
      material_id?: string;
      sku?: string;
      name?: string;
      description?: string | null;
      available_colors?: string[] | null;
      available?: boolean;
      visible?: boolean;
      cover_image_path?: string | null;
    },
  ) {
    return this.catalogService.updateProduct(id, payload);
  }

  @Patch('inventory/:productId')
  async updateInventory(
    @Param('productId') productId: string,
    @Body()
    payload: {
      on_hand?: number;
      reserved?: number;
    },
  ) {
    return this.catalogService.upsertInventory(productId, payload);
  }

  @Patch('material-printing-methods')
  async toggleMaterialPrintingMethod(
    @Body()
    payload: {
      material_id: string;
      printing_method_id: string;
      checked: boolean;
    },
  ) {
    return this.catalogService.toggleMaterialPrintingMethod(payload);
  }

  @Post('product-subtypes')
  async createProductSubtype(
    @Body()
    payload: {
      type_id: string;
      slug: string;
      name: string;
      description?: string | null;
      card_image_path?: string | null;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.catalogService.createProductSubtype(payload);
  }

  @Patch('product-subtypes/:id')
  async updateProductSubtype(
    @Param('id') id: string,
    @Body()
    payload: {
      type_id?: string;
      slug?: string;
      name?: string;
      description?: string | null;
      card_image_path?: string | null;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.catalogService.updateProductSubtype(id, payload);
  }

  @Patch('subtype-materials/:subtypeId')
  async setSubtypeMaterials(
    @Param('subtypeId') subtypeId: string,
    @Body()
    payload: {
      material_ids: string[];
    },
  ) {
    return this.catalogService.setSubtypeMaterials(subtypeId, payload.material_ids || []);
  }

  @Delete('product-subtypes/:id')
  async deleteProductSubtype(@Param('id') id: string) {
    return this.catalogService.deleteProductSubtype(id);
  }
}
