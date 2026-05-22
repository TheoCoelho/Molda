import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Part } from '../../entities/Part.entity';
import { ProductType } from '../../entities/ProductType.entity';
import { ProductSubtype } from '../../entities/ProductSubtype.entity';
import { Material } from '../../entities/Material.entity';
import { PrintingMethod } from '../../entities/PrintingMethod.entity';
import { Product } from '../../entities/Product.entity';
import { MaterialPrintingMethod } from '../../entities/MaterialPrintingMethod.entity';
import { ProductMaterial } from '../../entities/ProductMaterial.entity';
import { SubtypeMaterial } from '../../entities/SubtypeMaterial.entity';
import { Inventory } from '../../entities/Inventory.entity';

type UpsertPartPayload = {
  slug?: string;
  name?: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

type UpsertProductTypePayload = {
  part_id?: string;
  slug?: string;
  name?: string;
  description?: string | null;
  card_image_path?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

type UpsertProductSubtypePayload = {
  type_id?: string;
  slug?: string;
  name?: string;
  description?: string | null;
  card_image_path?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

type UpsertMaterialPayload = {
  name?: string;
  description?: string | null;
  is_active?: boolean;
};

type UpsertProductPayload = {
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
};

const DEFAULT_PARTS = [
  { slug: 'head', name: 'Cabeca', description: 'Parte superior', sort_order: 1 },
  { slug: 'torso', name: 'Tronco', description: 'Regiao central', sort_order: 2 },
  { slug: 'legs', name: 'Pernas', description: 'Parte inferior', sort_order: 3 },
] as const;

const normalizeSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Part)
    private partsRepository: Repository<Part>,
    @InjectRepository(ProductType)
    private productTypesRepository: Repository<ProductType>,
    @InjectRepository(ProductSubtype)
    private productSubtypesRepository: Repository<ProductSubtype>,
    @InjectRepository(Material)
    private materialsRepository: Repository<Material>,
    @InjectRepository(PrintingMethod)
    private printingMethodsRepository: Repository<PrintingMethod>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(MaterialPrintingMethod)
    private materialPrintingMethodsRepository: Repository<MaterialPrintingMethod>,
    @InjectRepository(ProductMaterial)
    private productMaterialsRepository: Repository<ProductMaterial>,
    @InjectRepository(SubtypeMaterial)
    private subtypeMaterialsRepository: Repository<SubtypeMaterial>,
    @InjectRepository(Inventory)
    private inventoryRepository: Repository<Inventory>,
  ) {}

  private asNullableTrimmed(value: string | null | undefined) {
    if (value === null || value === undefined) return undefined;
    const parsed = String(value).trim();
    return parsed.length ? parsed : undefined;
  }

  private toSortOrder(value: number | undefined) {
    return Number.isFinite(value as number) ? Number(value) : 0;
  }

  private async setProductMaterial(productId: string, materialId: string) {
    await this.productMaterialsRepository.delete({ product_id: productId });
    await this.productMaterialsRepository.save(
      this.productMaterialsRepository.create({
        product_id: productId,
        material_id: materialId,
      }),
    );
  }

  private async ensureDefaultParts() {
    for (const part of DEFAULT_PARTS) {
      const existing = await this.partsRepository.findOne({ where: { slug: part.slug } });
      if (existing) continue;

      await this.partsRepository.save(
        this.partsRepository.create({
          slug: part.slug,
          name: part.name,
          description: part.description,
          sort_order: part.sort_order,
          is_active: true,
        }),
      );
    }
  }

  async getParts() {
    await this.ensureDefaultParts();

    return this.partsRepository.find({
      order: { sort_order: 'ASC' },
    });
  }

  async ensurePart(payload: UpsertPartPayload) {
    const slug = normalizeSlug(String(payload.slug || payload.name || ''));
    if (!slug) {
      throw new BadRequestException('slug ou name obrigatorio para criar parte.');
    }

    const existing = await this.partsRepository.findOne({ where: { slug } });
    if (existing) return existing;

    const name = String(payload.name || slug).trim();
    const created = this.partsRepository.create({
      slug,
      name,
      description: payload.description ?? undefined,
      sort_order: Number.isFinite(payload.sort_order as number)
        ? Number(payload.sort_order)
        : DEFAULT_PARTS.find((part) => part.slug === slug)?.sort_order ?? 0,
      is_active: payload.is_active ?? true,
    });

    return this.partsRepository.save(created);
  }

  async getProductTypes(partId?: string) {
    const query = this.productTypesRepository.createQueryBuilder('pt');

    if (partId) {
      query.andWhere('pt.part_id = :partId', { partId });
    }

    return query.orderBy('pt.sort_order', 'ASC').getMany();
  }

  async createProductType(payload: UpsertProductTypePayload) {
    const partId = String(payload.part_id || '').trim();
    const name = String(payload.name || '').trim();
    const slug = normalizeSlug(String(payload.slug || payload.name || ''));

    if (!partId || !name || !slug) {
      throw new BadRequestException('part_id, name e slug sao obrigatorios.');
    }

    const entity = this.productTypesRepository.create({
      part_id: partId,
      name,
      slug,
      description: this.asNullableTrimmed(payload.description),
      card_image_path: this.asNullableTrimmed(payload.card_image_path),
      sort_order: Number.isFinite(payload.sort_order as number) ? Number(payload.sort_order) : 0,
      is_active: payload.is_active ?? true,
    });

    return this.productTypesRepository.save(entity);
  }

  async updateProductType(id: string, payload: UpsertProductTypePayload) {
    const existing = await this.productTypesRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tipo nao encontrado.');
    }

    if (payload.part_id !== undefined) existing.part_id = String(payload.part_id).trim();
    if (payload.name !== undefined) existing.name = String(payload.name).trim();
    if (payload.slug !== undefined) existing.slug = normalizeSlug(String(payload.slug));
    if (payload.description !== undefined) existing.description = this.asNullableTrimmed(payload.description);
    if (payload.card_image_path !== undefined) existing.card_image_path = this.asNullableTrimmed(payload.card_image_path);
    if (payload.sort_order !== undefined) existing.sort_order = Number(payload.sort_order) || 0;
    if (payload.is_active !== undefined) existing.is_active = !!payload.is_active;

    if (!existing.part_id || !existing.name || !existing.slug) {
      throw new BadRequestException('part_id, name e slug sao obrigatorios.');
    }

    return this.productTypesRepository.save(existing);
  }

  async getProductSubtypes(typeId?: string) {
    const query = this.productSubtypesRepository.createQueryBuilder('ps');

    if (typeId) {
      query.andWhere('ps.type_id = :typeId', { typeId });
    }

    return query.orderBy('ps.sort_order', 'ASC').getMany();
  }

  async createProductSubtype(payload: UpsertProductSubtypePayload) {
    const typeId = String(payload.type_id || '').trim();
    const name = String(payload.name || '').trim();
    const slug = normalizeSlug(String(payload.slug || payload.name || ''));

    if (!typeId || !name || !slug) {
      throw new BadRequestException('type_id, name e slug sao obrigatorios.');
    }

    const entity = this.productSubtypesRepository.create({
      type_id: typeId,
      name,
      slug,
      description: this.asNullableTrimmed(payload.description),
      card_image_path: this.asNullableTrimmed(payload.card_image_path),
      sort_order: Number.isFinite(payload.sort_order as number) ? Number(payload.sort_order) : 0,
      is_active: payload.is_active ?? true,
    });

    return this.productSubtypesRepository.save(entity);
  }

  async updateProductSubtype(id: string, payload: UpsertProductSubtypePayload) {
    const existing = await this.productSubtypesRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Subtipo nao encontrado.');
    }

    if (payload.type_id !== undefined) existing.type_id = String(payload.type_id).trim();
    if (payload.name !== undefined) existing.name = String(payload.name).trim();
    if (payload.slug !== undefined) existing.slug = normalizeSlug(String(payload.slug));
    if (payload.description !== undefined) existing.description = this.asNullableTrimmed(payload.description);
    if (payload.card_image_path !== undefined) existing.card_image_path = this.asNullableTrimmed(payload.card_image_path);
    if (payload.sort_order !== undefined) existing.sort_order = Number(payload.sort_order) || 0;
    if (payload.is_active !== undefined) existing.is_active = !!payload.is_active;

    if (!existing.type_id || !existing.name || !existing.slug) {
      throw new BadRequestException('type_id, name e slug sao obrigatorios.');
    }

    return this.productSubtypesRepository.save(existing);
  }

  async deleteProductSubtype(id: string) {
    const existing = await this.productSubtypesRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Subtipo nao encontrado.');
    }

    await this.productSubtypesRepository.delete({ id });
    return { id, deleted: true };
  }

  async getMaterials() {
    return this.materialsRepository.find({
      order: { name: 'ASC' },
    });
  }

  async createMaterial(payload: UpsertMaterialPayload) {
    const name = String(payload.name || '').trim();
    if (!name) {
      throw new BadRequestException('Nome do material e obrigatorio.');
    }

    const entity = this.materialsRepository.create({
      name,
      description: this.asNullableTrimmed(payload.description),
      is_active: payload.is_active ?? true,
    });

    return this.materialsRepository.save(entity);
  }

  async updateMaterial(id: string, payload: UpsertMaterialPayload) {
    const existing = await this.materialsRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Material nao encontrado.');
    }

    if (payload.name !== undefined) existing.name = String(payload.name).trim();
    if (payload.description !== undefined) existing.description = this.asNullableTrimmed(payload.description);
    if (payload.is_active !== undefined) existing.is_active = !!payload.is_active;

    if (!existing.name) {
      throw new BadRequestException('Nome do material e obrigatorio.');
    }

    return this.materialsRepository.save(existing);
  }

  async getProducts() {
    return this.productsRepository.find({
      order: { name: 'ASC' },
    });
  }

  async createProduct(payload: UpsertProductPayload) {
    const typeId = String(payload.type_id || '').trim();
    const sku = String(payload.sku || '').trim();
    const name = String(payload.name || '').trim();
    const materialId = String(payload.material_id || '').trim();

    if (!typeId || !sku || !name || !materialId) {
      throw new BadRequestException('type_id, material_id, sku e name sao obrigatorios.');
    }

    const entity = this.productsRepository.create({
      type_id: typeId,
      subtype_id: this.asNullableTrimmed(payload.subtype_id),
      sku,
      name,
      description: this.asNullableTrimmed(payload.description),
      available_colors:
        Array.isArray(payload.available_colors) && payload.available_colors.length
          ? payload.available_colors.map((color) => String(color).trim()).filter(Boolean)
          : undefined,
      available: payload.available ?? true,
      visible: payload.visible ?? true,
      cover_image_path: this.asNullableTrimmed(payload.cover_image_path),
    });

    const saved = await this.productsRepository.save(entity);
    await this.setProductMaterial(saved.id, materialId);
    return saved;
  }

  async updateProduct(id: string, payload: UpsertProductPayload) {
    const existing = await this.productsRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Produto nao encontrado.');
    }

    if (payload.type_id !== undefined) existing.type_id = String(payload.type_id).trim();
    if (payload.subtype_id !== undefined) existing.subtype_id = this.asNullableTrimmed(payload.subtype_id);
    if (payload.sku !== undefined) existing.sku = String(payload.sku).trim();
    if (payload.name !== undefined) existing.name = String(payload.name).trim();
    if (payload.description !== undefined) existing.description = this.asNullableTrimmed(payload.description);
    if (payload.available_colors !== undefined) {
      existing.available_colors =
        Array.isArray(payload.available_colors) && payload.available_colors.length
          ? payload.available_colors.map((color) => String(color).trim()).filter(Boolean)
          : undefined;
    }
    if (payload.available !== undefined) existing.available = !!payload.available;
    if (payload.visible !== undefined) existing.visible = !!payload.visible;
    if (payload.cover_image_path !== undefined) existing.cover_image_path = this.asNullableTrimmed(payload.cover_image_path);

    if (!existing.type_id || !existing.sku || !existing.name) {
      throw new BadRequestException('type_id, sku e name sao obrigatorios.');
    }

    const saved = await this.productsRepository.save(existing);
    if (payload.material_id !== undefined) {
      const materialId = String(payload.material_id || '').trim();
      if (!materialId) {
        throw new BadRequestException('material_id invalido.');
      }
      await this.setProductMaterial(saved.id, materialId);
    }

    return saved;
  }

  async getInventory() {
    return this.inventoryRepository.find();
  }

  async upsertInventory(productId: string, payload: { on_hand?: number; reserved?: number }) {
    if (!productId) {
      throw new BadRequestException('productId obrigatorio.');
    }

    const existing = await this.inventoryRepository.findOne({ where: { product_id: productId } });
    const next = existing ||
      this.inventoryRepository.create({
        product_id: productId,
        on_hand: 0,
        reserved: 0,
      });

    if (payload.on_hand !== undefined) next.on_hand = Math.max(0, Math.floor(Number(payload.on_hand) || 0));
    if (payload.reserved !== undefined) next.reserved = Math.max(0, Math.floor(Number(payload.reserved) || 0));
    next.updated_at = new Date();

    return this.inventoryRepository.save(next);
  }

  async getMaterialPrintingMethods() {
    return this.materialPrintingMethodsRepository.find();
  }

  async toggleMaterialPrintingMethod(payload: {
    material_id: string;
    printing_method_id: string;
    checked: boolean;
  }) {
    const materialId = String(payload.material_id || '').trim();
    const printingMethodId = String(payload.printing_method_id || '').trim();
    if (!materialId || !printingMethodId) {
      throw new BadRequestException('material_id e printing_method_id sao obrigatorios.');
    }

    if (payload.checked) {
      const existing = await this.materialPrintingMethodsRepository.findOne({
        where: { material_id: materialId, printing_method_id: printingMethodId },
      });
      if (!existing) {
        await this.materialPrintingMethodsRepository.save(
          this.materialPrintingMethodsRepository.create({
            material_id: materialId,
            printing_method_id: printingMethodId,
          }),
        );
      }
    } else {
      await this.materialPrintingMethodsRepository.delete({
        material_id: materialId,
        printing_method_id: printingMethodId,
      });
    }

    return { ok: true };
  }

  async getProductMaterials() {
    return this.productMaterialsRepository.find();
  }

  async getSubtypeMaterials() {
    return this.subtypeMaterialsRepository.find();
  }

  async setSubtypeMaterials(subtypeId: string, materialIds: string[]) {
    if (!subtypeId) {
      throw new BadRequestException('subtypeId obrigatorio.');
    }

    await this.subtypeMaterialsRepository.delete({ subtype_id: subtypeId });

    const uniqueMaterialIds = Array.from(new Set((materialIds || []).map((id) => String(id).trim()).filter(Boolean)));
    if (!uniqueMaterialIds.length) {
      return { subtype_id: subtypeId, count: 0 };
    }

    await this.subtypeMaterialsRepository.save(
      uniqueMaterialIds.map((materialId) =>
        this.subtypeMaterialsRepository.create({
          subtype_id: subtypeId,
          material_id: materialId,
        }),
      ),
    );

    return { subtype_id: subtypeId, count: uniqueMaterialIds.length };
  }

  async getPrintingMethods() {
    return this.printingMethodsRepository.find({
      order: { sort_order: 'ASC' },
    });
  }
}
