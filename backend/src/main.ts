import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const storageRoot = resolve(process.cwd(), 'storage');
  if (!existsSync(storageRoot)) {
    mkdirSync(storageRoot, { recursive: true });
  }
  app.use('/storage', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin,Content-Type,Accept,Authorization');
    next();
  });
  app.use('/storage', express.static(join(storageRoot)));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
