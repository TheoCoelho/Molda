import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getOrders(@Request() req: any, @Query() query: any) {
    return this.ordersService.getUserOrders(req.user.userId, query);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async getOrder(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.getOrder(id, req.user.userId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createOrder(@Body() dto: any, @Request() req: any) {
    return this.ordersService.createOrder(req.user.userId, dto);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'))
  async updateOrderStatus(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.ordersService.updateOrderStatus(id, dto.status, req.user.userId);
  }

  @Get(':id/events')
  @UseGuards(AuthGuard('jwt'))
  async getOrderEvents(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.getOrderEvents(id, req.user.userId);
  }
}
