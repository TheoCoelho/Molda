import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../entities/Order.entity';
import { OrderEvent } from '../../entities/OrderEvent.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderEvent)
    private orderEventsRepository: Repository<OrderEvent>,
  ) {}

  async getUserOrders(userId: string, query: any) {
    const qb = this.ordersRepository
      .createQueryBuilder('o')
      .where('o.user_id = :userId', { userId })
      .orderBy('o.created_at', 'DESC');

    if (query.status) {
      qb.andWhere('o.status = :status', { status: query.status });
    }

    const take = Math.min(parseInt(query.limit) || 50, 100);
    qb.take(take);

    const items = await qb.getMany();
    return { items };
  }

  async getOrder(id: string, userId: string) {
    return this.ordersRepository.findOne({
      where: { id, user_id: userId },
      relations: ['events'],
    });
  }

  async createOrder(userId: string, dto: any) {
    const orderNumber = `ORD-${Date.now()}`;

    const order = this.ordersRepository.create({
      ...dto,
      user_id: userId,
      order_number: orderNumber,
      status: 'pending',
    });

    const saved = await this.ordersRepository.save(order as any);
    const savedOrder = Array.isArray(saved) ? saved[0] : saved;

    await this.recordEvent(savedOrder.id, 'order_created', userId, { order_id: savedOrder.id });

    return savedOrder;
  }

  async updateOrderStatus(id: string, newStatus: string, userId: string) {
    const order = await this.ordersRepository.findOne({ where: { id } });

    if (!order) {
      throw new Error('Order not found');
    }

    const previousStatus = order.status;
    order.status = newStatus as 'pending' | 'approved' | 'production' | 'quality_check' | 'ready_to_ship' | 'shipped' | 'delivered' | 'cancelled';

    const updated = await this.ordersRepository.save(order);

    await this.recordEvent(
      id,
      'status_changed',
      userId,
      { previous: previousStatus, new: newStatus },
      previousStatus,
      newStatus,
    );

    return updated;
  }

  async getOrderEvents(id: string, userId: string) {
    const order = await this.ordersRepository.findOne({ where: { id, user_id: userId } });
    if (!order) {
      throw new Error('Order not found');
    }

    const items = await this.orderEventsRepository.find({
      where: { order_id: id },
      order: { created_at: 'DESC' },
    });

    return { items };
  }

  private async recordEvent(
    orderId: string,
    eventType: string,
    userId: string,
    details?: any,
    previousStatus?: string,
    newStatus?: string,
  ) {
    const event = this.orderEventsRepository.create({
      order_id: orderId,
      event_type: eventType,
      triggered_by: userId,
      details: details || {},
      previous_status: previousStatus,
      new_status: newStatus,
    });

    await this.orderEventsRepository.save(event);
  }
}
